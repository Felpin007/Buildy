import fs from "fs/promises"
import { join } from "path"
import { fileExistsAtPath } from "../../utils/fs" 
import { GIT_DISABLED_SUFFIX } from "./CheckpointGitOperations" 
export const getDefaultExclusions = (lfsPatterns: string[] = []): string[] => [
	".git/", 
	`.git${GIT_DISABLED_SUFFIX}/`, 
	...getBuildArtifactPatterns(),
	...getMediaFilePatterns(),
	...getCacheFilePatterns(),
	...getConfigFilePatterns(),
	...getLargeDataFilePatterns(),
	...getDatabaseFilePatterns(),
	...getGeospatialPatterns(),
	...getLogFilePatterns(),
	...lfsPatterns,
]
function getBuildArtifactPatterns(): string[] {
	return [
		".gradle/",
		".idea/",
		".parcel-cache/",
		".pytest_cache/",
		".next/",
		".nuxt/",
		".sass-cache/",
		".vs/",
		".vscode/", 
		"Pods/",
		"__pycache__/",
		"bin/",
		"build/",
		"bundle/",
		"coverage/",
		"deps/",
		"dist/",
		"env/",
		"node_modules/",
		"obj/",
		"out/", 
		"pkg/",
		"pycache/",
		"target/dependency/", 
		"temp/",
		"vendor/",
		"venv/", 
	]
}
function getMediaFilePatterns(): string[] {
	return [
		"*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.ico", "*.webp",
		"*.tiff", "*.tif", "*.raw", "*.heic", "*.avif", "*.eps", "*.psd",
		"*.3gp", "*.avi", "*.divx", "*.flv", "*.m4v", "*.mkv", "*.mov",
		"*.mp4", "*.mpeg", "*.mpg", "*.ogv", "*.rm", "*.rmvb", "*.vob",
		"*.webm", "*.wmv",
		"*.aac", "*.aiff", "*.flac", "*.m4a", "*.mp3", "*.ogg", "*.opus",
		"*.wav", "*.wma",
	]
}
function getCacheFilePatterns(): string[] {
	return [
		"*.DS_Store", 
		"*.Thumbs.db", 
		"*.bak",
		"*.cache",
		"*.crdownload", 
		"*.dmp",
		"*.dump",
		"*.eslintcache",
		"*.lock", 
		"*.log", 
		"*.old",
		"*.part", 
		"*.partial", 
		"*.pyc", "*.pyo", 
		"*.stackdump",
		"*.swo", "*.swp", 
		"*.temp",
		"*.tmp",
	]
}
function getConfigFilePatterns(): string[] {
	return [".env", ".env.*", "*.local", "*.development", "*.production"]
}
function getLargeDataFilePatterns(): string[] {
	return [
		"*.zip", "*.tar", "*.gz", "*.rar", "*.7z", "*.bz2", "*.xz",
		"*.iso", "*.dmg", "*.msi", "*.pkg",
		"*.bin", "*.exe", "*.dll", "*.so", "*.dylib", "*.app",
		"*.dat", "*.data",
	]
}
function getDatabaseFilePatterns(): string[] {
	return [
		"*.db", "*.db3", "*.sqlite", "*.sqlite3", "*.mdb", "*.accdb",
		"*.sql", "*.dump", "*.sql.gz",
		"*.ibd", "*.frm", "*.myd", "*.myi", 
		"*.rdb", "*.aof", 
		"*.pdb", 
		"*.arrow", "*.avro", "*.csv", "*.tsv", "*.parquet", "*.orc", "*.bson",
		"*.dbf", 
	]
}
function getGeospatialPatterns(): string[] {
	return [
		"*.shp", "*.shx", "*.dbf", "*.prj", "*.sbn", "*.sbx", "*.shp.xml", "*.cpg",
		"*.gdb", "*.gpkg", "*.kml", "*.kmz", "*.gml", "*.geojson",
		"*.dem", "*.asc", "*.img", "*.ecw", "*.tif", "*.tiff", 
		"*.las", "*.laz",
		"*.mxd", "*.qgs",
		"*.grd",
		"*.dwg", "*.dxf",
	]
}
function getLogFilePatterns(): string[] {
	return ["*.error", "*.log", "*.logs", "*.npm-debug.log*", "*.out", "*.stdout", "yarn-debug.log*", "yarn-error.log*"]
}
export const writeExcludesFile = async (gitPath: string, lfsPatterns: string[] = []): Promise<void> => {
	const excludesPath = join(gitPath, "info", "exclude");
	try {
		await fs.mkdir(join(gitPath, "info"), { recursive: true });
		const patterns = getDefaultExclusions(lfsPatterns);
		await fs.writeFile(excludesPath, patterns.join("\n"));
		console.log(`[CheckpointExclusions] Escreveu ${patterns.length} padrões em ${excludesPath}`);
	} catch (error) {
		console.error(`[CheckpointExclusions] Falha ao escrever arquivo de exclusões em ${excludesPath}:`, error);
	}
}
export const getLfsPatterns = async (workspacePath: string): Promise<string[]> => {
	try {
		const attributesPath = join(workspacePath, ".gitattributes");
		if (await fileExistsAtPath(attributesPath)) {
			const attributesContent = await fs.readFile(attributesPath, "utf8");
			const lfsRegex = /^\s*([^\s]+)\s+.*filter=lfs/gm;
			const patterns: string[] = [];
			let match;
			while ((match = lfsRegex.exec(attributesContent)) !== null) {
				patterns.push(match[1]);
			}
			console.log(`[CheckpointExclusions] Encontrados padrões LFS em .gitattributes: ${patterns.join(', ')}`);
			return patterns;
		}
	} catch (error) {
		console.warn("[CheckpointExclusions] Falha ao ler .gitattributes:", error);
	}
	return [];
}
