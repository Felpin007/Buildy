// src/services/checkpoint/CheckpointExclusions.ts
import fs from "fs/promises"
import { join } from "path"
import { fileExistsAtPath } from "../../utils/fs" // Use the new utility
import { GIT_DISABLED_SUFFIX } from "./CheckpointGitOperations" // This will be created next

/**
 * CheckpointExclusions Module
 *
 * Manages file exclusion rules for the checkpoint tracking process.
 */

/**
 * Returns the default list of file and directory patterns to exclude from checkpoints.
 * Combines built-in patterns with workspace-specific LFS patterns.
 *
 * @param lfsPatterns - Optional array of Git LFS patterns from workspace
 * @returns Array of glob patterns to exclude
 */
export const getDefaultExclusions = (lfsPatterns: string[] = []): string[] => [
	// Build and Development Artifacts
	".git/", // User's main git repo
	`.git${GIT_DISABLED_SUFFIX}/`, // Renamed nested repos
	...getBuildArtifactPatterns(),

	// Media Files
	...getMediaFilePatterns(),

	// Cache and Temporary Files
	...getCacheFilePatterns(),

	// Environment and Config Files
	...getConfigFilePatterns(),

	// Large Data Files
	...getLargeDataFilePatterns(),

	// Database Files
	...getDatabaseFilePatterns(),

	// Geospatial Datasets
	...getGeospatialPatterns(),

	// Log Files
	...getLogFilePatterns(),

	// Add LFS patterns from workspace .gitattributes
	...lfsPatterns,
]

/**
 * Returns patterns for common build and development artifact directories
 * @returns Array of glob patterns for build artifacts
 */
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
		".vscode/", // Exclude VS Code specific settings/cache within workspace
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
		"out/", // Common output directory for TS/JS projects
		"pkg/",
		"pycache/",
		"target/dependency/", // Common in Java/Maven/Gradle
		"temp/",
		"vendor/",
		"venv/", // Common Python virtual environment folder
	]
}

/**
 * Returns patterns for common media and image file types
 * @returns Array of glob patterns for media files
 */
function getMediaFilePatterns(): string[] {
	return [
		// Images
		"*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.ico", "*.webp",
		"*.tiff", "*.tif", "*.raw", "*.heic", "*.avif", "*.eps", "*.psd",
		// Videos
		"*.3gp", "*.avi", "*.divx", "*.flv", "*.m4v", "*.mkv", "*.mov",
		"*.mp4", "*.mpeg", "*.mpg", "*.ogv", "*.rm", "*.rmvb", "*.vob",
		"*.webm", "*.wmv",
		// Audio
		"*.aac", "*.aiff", "*.flac", "*.m4a", "*.mp3", "*.ogg", "*.opus",
		"*.wav", "*.wma",
		// Note: SVG is often treated as code, so it's commented out by default
		// "*.svg",
	]
}

/**
 * Returns patterns for cache, temporary, and system files
 * @returns Array of glob patterns for cache files
 */
function getCacheFilePatterns(): string[] {
	return [
		"*.DS_Store", // macOS system file
		"*.Thumbs.db", // Windows system file
		"*.bak",
		"*.cache",
		"*.crdownload", // Chrome partial download
		"*.dmp",
		"*.dump",
		"*.eslintcache",
		"*.lock", // Common lock file extension
		"*.log", // Often excluded, but covered by getLogFilePatterns too
		"*.old",
		"*.part", // Partial download
		"*.partial", // Partial download
		"*.pyc", "*.pyo", // Python compiled files
		"*.stackdump",
		"*.swo", "*.swp", // Vim swap files
		"*.temp",
		"*.tmp",
	]
}

/**
 * Returns patterns for environment and configuration files (often contain secrets)
 * @returns Array of glob patterns for config files
 */
function getConfigFilePatterns(): string[] {
	// Be cautious with overly broad patterns like *.env
	return [".env", ".env.*", "*.local", "*.development", "*.production"]
}

/**
 * Returns patterns for common large binary and archive files
 * @returns Array of glob patterns for large data files
 */
function getLargeDataFilePatterns(): string[] {
	return [
		// Archives
		"*.zip", "*.tar", "*.gz", "*.rar", "*.7z", "*.bz2", "*.xz",
		// Disk Images / Installers
		"*.iso", "*.dmg", "*.msi", "*.pkg",
		// Executables / Libraries
		"*.bin", "*.exe", "*.dll", "*.so", "*.dylib", "*.app",
		// Other large binary formats
		"*.dat", "*.data",
	]
}

/**
 * Returns patterns for database and data storage files
 * @returns Array of glob patterns for database files
 */
function getDatabaseFilePatterns(): string[] {
	return [
		// Common DB file extensions
		"*.db", "*.db3", "*.sqlite", "*.sqlite3", "*.mdb", "*.accdb",
		// SQL files (can be large, sometimes excluded)
		"*.sql", "*.dump", "*.sql.gz",
		// Specific DB system files
		"*.ibd", "*.frm", "*.myd", "*.myi", // MySQL
		"*.rdb", "*.aof", // Redis
		"*.pdb", // Program Database (often large debug info)
		// Data formats
		"*.arrow", "*.avro", "*.csv", "*.tsv", "*.parquet", "*.orc", "*.bson",
		"*.dbf", // dBase file, sometimes used with Shapefiles
	]
}

/**
 * Returns patterns for geospatial and mapping data files
 * @returns Array of glob patterns for geospatial files
 */
function getGeospatialPatterns(): string[] {
	return [
		// Shapefile components
		"*.shp", "*.shx", "*.dbf", "*.prj", "*.sbn", "*.sbx", "*.shp.xml", "*.cpg",
		// Other common formats
		"*.gdb", "*.gpkg", "*.kml", "*.kmz", "*.gml", "*.geojson",
		// Raster/Elevation data
		"*.dem", "*.asc", "*.img", "*.ecw", "*.tif", "*.tiff", // TIFF often used here
		// LiDAR data
		"*.las", "*.laz",
		// Project files
		"*.mxd", "*.qgs",
		// Grid files
		"*.grd",
		// CAD files (sometimes used with GIS)
		"*.dwg", "*.dxf",
	]
}

/**
 * Returns patterns for log and debug output files
 * @returns Array of glob patterns for log files
 */
function getLogFilePatterns(): string[] {
	return ["*.error", "*.log", "*.logs", "*.npm-debug.log*", "*.out", "*.stdout", "yarn-debug.log*", "yarn-error.log*"]
}

/**
 * Writes the combined exclusion patterns to Git's exclude file within the shadow repo.
 * Creates the info directory if it doesn't exist.
 *
 * @param gitPath - Path to the shadow .git directory
 * @param lfsPatterns - Optional array of Git LFS patterns to include
 */
export const writeExcludesFile = async (gitPath: string, lfsPatterns: string[] = []): Promise<void> => {
	const excludesPath = join(gitPath, "info", "exclude");
	try {
		await fs.mkdir(join(gitPath, "info"), { recursive: true });
		const patterns = getDefaultExclusions(lfsPatterns);
		await fs.writeFile(excludesPath, patterns.join("\n"));
		console.log(`[CheckpointExclusions] Wrote ${patterns.length} patterns to ${excludesPath}`);
	} catch (error) {
		console.error(`[CheckpointExclusions] Failed to write excludes file at ${excludesPath}:`, error);
		// Decide if this should throw or just warn
		// throw new Error(`Failed to write excludes file: ${error.message}`);
	}
}

/**
 * Retrieves Git LFS patterns from the workspace's .gitattributes file.
 * Returns an empty array if no patterns found or file doesn't exist.
 *
 * @param workspacePath - Path to the workspace root
 * @returns Array of Git LFS patterns found in .gitattributes
 */
export const getLfsPatterns = async (workspacePath: string): Promise<string[]> => {
	try {
		const attributesPath = join(workspacePath, ".gitattributes");
		if (await fileExistsAtPath(attributesPath)) {
			const attributesContent = await fs.readFile(attributesPath, "utf8");
			// Regex to find lines like: *.psd filter=lfs diff=lfs merge=lfs -text
			const lfsRegex = /^\s*([^\s]+)\s+.*filter=lfs/gm;
			const patterns: string[] = [];
			let match;
			while ((match = lfsRegex.exec(attributesContent)) !== null) {
				patterns.push(match[1]);
			}
			console.log(`[CheckpointExclusions] Found LFS patterns in .gitattributes: ${patterns.join(', ')}`);
			return patterns;
		}
	} catch (error) {
		console.warn("[CheckpointExclusions] Failed to read .gitattributes:", error);
	}
	return [];
}