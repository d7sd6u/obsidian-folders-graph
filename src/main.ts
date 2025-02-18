import { MetadataCache, TFile } from "obsidian";

import { around } from "monkey-around";

import { TypedWorkspaceLeaf } from "../obsidian-typings/src/obsidian/internals/TypedWorkspaceLeaf";
import { GraphView } from "../obsidian-typings/src/obsidian/internals/InternalPlugins/Graph/GraphView";
import { LocalGraphView } from "../obsidian-typings/src/obsidian/internals/InternalPlugins/Graph/LocalGraphView";
import { GraphColorAttributes } from "../obsidian-typings/src/obsidian/internals/InternalPlugins/Graph/GraphColorAttributes";

import PluginWithSettings from "../obsidian-reusables/src/PluginWithSettings";

export default class Main extends PluginWithSettings({}) {
	override onload(): void {
		this.refreshGraphLeaves();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const filtered = this.getLeavesOfTypeGraph().find(
					(v) => v === leaf,
				);
				if (filtered) this.refreshGraphLeaves([filtered]);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.refreshGraphLeaves();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			const update = this.updateCacheWithVirtualFolders.bind(this);
			update();
			this.registerEvent(this.app.vault.on("create", update));
			this.registerEvent(this.app.vault.on("delete", update));
			this.registerEvent(this.app.vault.on("rename", update));
		});
	}

	private refreshGraphLeaves(leaves = this.getLeavesOfTypeGraph()): void {
		leaves.forEach((leaf) => {
			this.patchGraphEngine(leaf);
		});
	}
	private resolvedLinksOverrides: Record<string, Record<string, number>> = {};
	private folderToVirtualIndexes = new Map<string, string>();
	private fileFilterOverrides: Record<string, GraphColorAttributes> = {};
	private updateCacheWithVirtualFolders() {
		const fileFilterOverrides: Record<string, GraphColorAttributes> = {};
		const resolvedLinksOverrides = {
			...this.app.metadataCache.resolvedLinks,
		};

		const pallete = {
			red: { light: 0xe93147, dark: 0xfb464c },
			orange: { light: 0xec7500, dark: 0xe9973f },
			yellow: { light: 0xe0ac00, dark: 0xe0de71 },
			green: { light: 0x08b94e, dark: 0x44cf6e },
			cyan: { light: 0x00bfbc, dark: 0x53dfdd },
			blue: { light: 0x086ddd, dark: 0x027aff },
			purple: { light: 0x7852ee, dark: 0xa882ff },
			pink: { light: 0xd53984, dark: 0xfa99cd },
		};
		const emptyIndexFileColor = pallete.cyan.dark;
		const rootIndexFileColor = pallete.pink.dark;
		const nonEmptyIndexFileColor = pallete.blue.dark;

		const folderToRealIndexes = new Map<string, string>();
		for (const node of this.app.vault.getAllLoadedFiles()) {
			if (
				node instanceof TFile &&
				node.parent &&
				node.extension === "md" &&
				(node.basename === node.parent.name || node.path === "Root.md")
			) {
				folderToRealIndexes.set(node.parent.path, node.path);
				fileFilterOverrides[node.path] = {
					rgb: emptyIndexFileColor,
					a: 1,
				};
			}
		}
		const folderToVirtualIndexes = new Map<string, string>();
		const virtualFolderIndexExt = ".dir";
		for (const node of [
			...this.app.vault.getAllFolders(),
			this.app.vault.root,
		]) {
			if (!folderToRealIndexes.has(node.path)) {
				const virtualIndexFile =
					node.path === "/"
						? "Root" + virtualFolderIndexExt
						: node.path + "/" + node.name + virtualFolderIndexExt;
				folderToVirtualIndexes.set(node.path, virtualIndexFile);
			}
		}
		const filesToParentFolder = [
			this.app.vault
				.getAllLoadedFiles()
				.filter((v) => v instanceof TFile)
				.map((v: TFile) =>
					v.parent?.name === v.basename
						? ([v.path, v.parent.parent?.path] as const)
						: ([v.path, v.parent?.path] as const),
				),
			[...folderToVirtualIndexes].map(
				([folder, index]) =>
					[
						index,
						folder.split("/").slice(0, -1).join("/") || "/",
					] as const,
			),
		].flat();
		for (const [nodePath, nodeParentPath] of filesToParentFolder) {
			if (!nodeParentPath) continue;
			const realIndex = folderToRealIndexes.get(nodeParentPath);
			const virtualIndex = folderToVirtualIndexes.get(nodeParentPath);
			if (nodePath === "Root.dir" || nodePath === "Root.md") continue;
			const indexFile =
				realIndex ??
				virtualIndex ??
				(folderToRealIndexes.has("/") ? "Root.md" : "Root.dir");
			fileFilterOverrides[indexFile] = {
				rgb:
					indexFile === "Root.dir" || indexFile === "Root.md"
						? rootIndexFileColor
						: nonEmptyIndexFileColor,
				a: realIndex ? 1 : 0.5,
			};
			const indexFileLinks = resolvedLinksOverrides[indexFile] ?? {};

			indexFileLinks[nodePath] ??= 1;

			resolvedLinksOverrides[indexFile] = indexFileLinks;
		}

		this.resolvedLinksOverrides = resolvedLinksOverrides;
		this.folderToVirtualIndexes = folderToVirtualIndexes;
		this.fileFilterOverrides = fileFilterOverrides;
	}

	private patchGraphEngine(
		leaf:
			| TypedWorkspaceLeaf<GraphView>
			| TypedWorkspaceLeaf<LocalGraphView>,
	) {
		const engine =
			"dataEngine" in leaf.view
				? leaf.view.dataEngine
				: "engine" in leaf.view
					? leaf.view.engine
					: undefined;
		if (!engine) return;
		this.registerPatch(Object.getPrototypeOf(engine) as typeof engine, {
			render(next, plugin) {
				return function (this: typeof engine, ...args) {
					this.searchQueries = [];

					this.fileFilter = {
						...this.fileFilter,
						...plugin.fileFilterOverrides,
					};

					const realResolvedLinks =
						this.app.metadataCache.resolvedLinks;
					this.app.metadataCache.resolvedLinks =
						plugin.resolvedLinksOverrides;
					const disable = around(MetadataCache.prototype, {
						getCachedFiles(next) {
							return function (this: MetadataCache, ...args) {
								const trueCache = next.apply(this, args);
								return [
									...plugin.folderToVirtualIndexes.values(),
									...trueCache,
								];
							};
						},
					});
					next.apply(this, args);
					disable();
					this.app.metadataCache.resolvedLinks = realResolvedLinks;
				};
			},
		});
	}

	private getLeavesOfTypeGraph() {
		return [
			...this.app.workspace.getLeavesOfType("graph"),
			...this.app.workspace.getLeavesOfType("localgraph"),
		];
	}
}
