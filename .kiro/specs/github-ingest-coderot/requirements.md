# Requirements Document

## Feature Overview: GitHub Repository Ingestion & Code-Rot Analyzer

The GitHub Repository Ingestion & Code-Rot Analyzer system provides an API endpoint that ingests GitHub repositories, analyzes code structure and quality metrics, calculates a "code-rot" score, and generates a graph-ready data structure for visualization. The system detects repository structure, extracts core code files, analyzes import/export relationships, and computes code quality indicators without requiring direct repository cloning to disk.

## Introduction

This system serves as the bridge between GitHub repositories and the Necro-Docs visualization engine. It enables rapid code archaeology without disk-intensive operations, supporting both automated analysis and interactive exploration through the voice debugger. The code-rot score provides a quantifiable metric for identifying files that may require refactoring or increased documentation.

**Key Objectives:**
- Provide a scalable API for repository analysis
- Detect code quality degradation through quantifiable metrics
- Generate graph-ready node/edge data for visualization
- Support voice AI analysis through structured metadata
- Enable rapid prototyping with built-in demo repositories

---

## Glossary

- **Repository**: A GitHub project repository identified by owner and name
- **Default_Branch**: The primary development branch of a repository (typically "main" or "master")
- **File_Tree**: Hierarchical structure of files and directories in a repository
- **Code_File**: Source file with supported extension (.ts, .tsx, .js, .jsx, .py)
- **Code_Rot_Score**: Numerical indicator (0-100) of code quality degradation
- **Import_Relation**: Declaration indicating one file depends on another (e.g., `import X from './file'`)
- **Export_Relation**: Declaration exporting functionality from a file (e.g., `export function X`)
- **Node**: Graph representation of a code file with metadata and metrics
- **Edge**: Graph connection representing import/export relationship between nodes
- **Lines_Of_Code**: Count of non-blank, non-comment lines in a file
- **Nesting_Depth**: Maximum level of code block indentation
- **Comment_Ratio**: Percentage of lines containing comments vs total lines
- **API_Token**: GitHub Personal Access Token for authenticated API requests
- **GitHub_REST_API**: Official GitHub API endpoints for repository and content access

---

## Requirements

### Requirement 1: Accept GitHub Repository URL via POST Request

**User Story:** As a developer, I want to submit a GitHub repository URL via API, so that the system can analyze that repository's code structure and quality.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/ingest` with a valid GitHub repository URL, THE Ingest_API SHALL accept the request and begin processing
2. THE Ingest_API SHALL validate that the request body contains a required `repositoryUrl` field of type string
3. WHEN a request lacks the `repositoryUrl` field, THE Ingest_API SHALL return HTTP 400 with error code `MISSING_REPOSITORY_URL`
4. WHEN a request contains an invalid URL format, THE Ingest_API SHALL return HTTP 400 with error code `INVALID_URL_FORMAT`
5. WHEN a request contains a non-GitHub URL, THE Ingest_API SHALL return HTTP 400 with error code `NON_GITHUB_REPOSITORY`
6. THE Ingest_API SHALL extract owner and repository name from the URL in format `https://github.com/{owner}/{repo}`

---

### Requirement 2: Detect Default Branch Automatically

**User Story:** As a system, I want to automatically detect the default branch, so that I don't require manual branch specification from users.

#### Acceptance Criteria

1. WHEN a valid repository URL is provided, THE Branch_Detector SHALL query the GitHub REST API for repository metadata
2. WHEN the GitHub API returns repository information, THE Branch_Detector SHALL extract the `default_branch` field
3. THE Branch_Detector SHALL use the default branch without requiring user input
4. WHEN GitHub API returns an error, THE Branch_Detector SHALL return HTTP 502 with error code `GITHUB_API_ERROR`
5. WHEN the repository does not exist, THE Branch_Detector SHALL return HTTP 404 with error code `REPOSITORY_NOT_FOUND`
6. THE Branch_Detector SHALL prioritize using `process.env.GITHUB_TOKEN` for authenticated requests to increase rate limits

---

### Requirement 3: Retrieve File Tree via GitHub REST API

**User Story:** As an analyzer, I want to retrieve the repository structure without cloning, so that I can work within time and resource constraints.

#### Acceptance Criteria

1. WHEN a default branch is detected, THE File_Tree_Fetcher SHALL retrieve the repository tree structure using the GitHub REST API endpoint `/repos/{owner}/{repo}/git/trees/{branch}`
2. THE File_Tree_Fetcher SHALL use recursive tree retrieval with `recursive=1` parameter to fetch all nested files
3. WHEN the GitHub API returns a tree response, THE File_Tree_Fetcher SHALL parse the response and build an in-memory file hierarchy
4. THE File_Tree_Fetcher SHALL not perform git clone operations or write files to disk
5. WHEN GitHub API rate limit is reached, THE File_Tree_Fetcher SHALL return HTTP 429 with error code `RATE_LIMIT_EXCEEDED`
6. THE File_Tree_Fetcher SHALL include authentication token in request headers if `process.env.GITHUB_TOKEN` is defined

---

### Requirement 4: Filter and Select Core Code Files

**User Story:** As an analyzer, I want to identify and limit core code files, so that analysis remains performant and focused.

#### Acceptance Criteria

1. WHEN a file tree is retrieved, THE File_Filter SHALL identify all files with extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`
2. THE File_Filter SHALL exclude configuration files, tests, and build outputs matching patterns: `*.config.*`, `*.test.*`, `*.spec.*`, `node_modules/*`, `dist/*`, `build/*`
3. THE File_Filter SHALL sort filtered files by size in ascending order and select the first 25 files maximum
4. WHEN fewer than 25 code files exist, THE File_Filter SHALL process all available code files
5. THE File_Filter SHALL store the selection criteria (extension, exclusion patterns, sort method, limit) in processing metadata
6. IF no code files are found after filtering, THE File_Filter SHALL return HTTP 422 with error code `NO_CODE_FILES_FOUND`

---

### Requirement 5: Retrieve Code Content for Selected Files

**User Story:** As an analyzer, I want to read the content of code files, so that I can analyze structure and relationships.

#### Acceptance Criteria

1. WHEN a list of code files is selected, THE Content_Fetcher SHALL retrieve the raw content of each file using the GitHub REST API endpoint `/repos/{owner}/{repo}/contents/{file_path}`
2. THE Content_Fetcher SHALL fetch files in parallel with a maximum concurrency of 5 parallel requests
3. THE Content_Fetcher SHALL handle GitHub API response headers including rate-limit and content-encoding information
4. WHEN a file is larger than 1MB, THE Content_Fetcher SHALL truncate the content with a note and include the first 50KB
5. WHEN GitHub API returns 404 for a file, THE Content_Fetcher SHALL skip that file and continue processing
6. THE Content_Fetcher SHALL store the raw content for each file without modification

---

### Requirement 6: Detect Import/Export Relationships

**User Story:** As a graph builder, I want to identify code dependencies, so that I can visualize relationships between modules.

#### Acceptance Criteria

1. WHEN code content is retrieved, THE Relationship_Detector SHALL scan each file for import/require statements
2. FOR TypeScript/JavaScript files, THE Relationship_Detector SHALL detect patterns: `import`, `require()`, `export`, `export default`
3. FOR Python files, THE Relationship_Detector SHALL detect patterns: `import`, `from ... import`, `from ... import *`
4. THE Relationship_Detector SHALL extract the target module name or path from each statement
5. WHEN a detected import references a selected code file, THE Relationship_Detector SHALL create an edge relationship
6. THE Relationship_Detector SHALL normalize paths using forward slashes and resolve relative paths to absolute file paths
7. WHEN a file has no imports or exports, THE Relationship_Detector SHALL create that file as an isolated node with no edges

---

### Requirement 7: Calculate Code-Rot Score

**User Story:** As a quality analyzer, I want to compute a code-rot score, so that I can identify files with potential maintenance issues.

#### Acceptance Criteria

1. WHEN a code file is analyzed, THE Code_Rot_Calculator SHALL compute a Code_Rot_Score ranging from 0 (healthy) to 100 (high risk)
2. THE Code_Rot_Calculator SHALL calculate Lines_Of_Code by counting non-blank, non-comment-only lines
3. THE Code_Rot_Calculator SHALL determine Nesting_Depth by finding the maximum indentation level in the code
4. THE Code_Rot_Calculator SHALL calculate Comment_Ratio as (total comment lines / total lines) * 100
5. THE Code_Rot_Calculator SHALL apply the following scoring formula:
   - Base Score = 50
   - Add (Lines_Of_Code / 100) points, capped at +25 (penalize large files)
   - Add (Nesting_Depth / 5) points, capped at +15 (penalize deep nesting)
   - Subtract (Comment_Ratio / 5) points, minimum -10 (reward well-commented code)
   - Final_Score = clamp(Base_Score + adjustments, 0, 100)
6. WHEN a file is very small (<5 lines), THE Code_Rot_Calculator SHALL set Code_Rot_Score to 10
7. WHEN a file has balanced metrics (moderate size, reasonable nesting, good comments), THE Code_Rot_Calculator SHALL produce a score in the 30-50 range

---

### Requirement 8: Create Node Graph Metadata

**User Story:** As a graph visualizer, I want nodes with complete metadata, so that the UI and voice AI can work with rich information.

#### Acceptance Criteria

1. WHEN a code file is analyzed, THE Node_Creator SHALL create a Node object for each file
2. EACH Node SHALL contain the following metadata:
   - `id`: Unique identifier (file path)
   - `path`: Full file path in repository
   - `name`: File name only
   - `language`: Programming language (.ts → TypeScript, .py → Python, etc.)
   - `rotScore`: Code_Rot_Score (0-100)
   - `linesOfCode`: Total non-blank, non-comment lines
   - `summaryMetrics`: Object containing `nestingDepth`, `commentRatio`, `fileSize`
   - `rawContent`: First 4000 characters of file content
   - `isTruncated`: Boolean indicating if rawContent was truncated
   - `importCount`: Number of imports/requires in file
   - `exportCount`: Number of exports in file
3. THE Node_Creator SHALL ensure all nodes have consistent structure and type safety
4. THE Node_Creator SHALL include ISO 8601 timestamp of analysis in each node

---

### Requirement 9: Create Edge Graph Relationships

**User Story:** As a graph visualizer, I want edges representing dependencies, so that relationships are clear and traversable.

#### Acceptance Criteria

1. WHEN import/export relationships are detected, THE Edge_Creator SHALL create an Edge object for each relationship
2. EACH Edge SHALL contain the following metadata:
   - `id`: Unique identifier (format: `{source_id}→{target_id}`)
   - `source`: ID of importing file
   - `target`: ID of imported file
   - `type`: Relationship type (`import`, `require`, `export`)
   - `label`: Module name that was imported/required
3. THE Edge_Creator SHALL ensure all edges reference valid node IDs
4. THE Edge_Creator SHALL deduplicate edges where both source and target are identical (prevent self-loops unless intentional)
5. WHEN a file imports the same module multiple times, THE Edge_Creator SHALL create a single edge with import count in metadata

---

### Requirement 10: Return Analysis Result in API Response

**User Story:** As a client, I want a structured response, so that I can use the analysis data immediately in visualization.

#### Acceptance Criteria

1. WHEN analysis completes successfully, THE Ingest_API SHALL return HTTP 200 with response containing:
   - `success`: boolean true
   - `data`: Object with `nodes` and `edges` arrays
   - `meta`: Object with timestamp and duration in milliseconds
2. EACH response SHALL include analysis metadata:
   - `repositoryUrl`: The analyzed repository URL
   - `defaultBranch`: Detected default branch
   - `analyzedAt`: ISO 8601 timestamp
   - `fileCount`: Number of files analyzed
   - `averageRotScore`: Mean of all Code_Rot_Scores
   - `processingDurationMs`: Total time in milliseconds
3. THE Ingest_API SHALL include a `nodes` array with all Node objects
4. THE Ingest_API SHALL include an `edges` array with all Edge objects
5. WHEN analysis encounters errors after accepting the request, THE Ingest_API SHALL return HTTP 500 with error code `ANALYSIS_FAILED` and error details

---

### Requirement 11: Support Demo Repository Presets

**User Story:** As a tester, I want built-in demo repositories, so that I can test the system without manual URL input.

#### Acceptance Criteria

1. WHEN the Ingest_API receives a request with `useDemo: true` and `demoId` parameter, THE Demo_Manager SHALL load a preset repository
2. THE Demo_Manager SHALL provide exactly 2 demo repository presets:
   - `demo1`: A small TypeScript project (e.g., `https://github.com/vercel/next.js` or similar popular repo)
   - `demo2`: A Python project (e.g., `https://github.com/pallets/flask` or similar)
3. WHEN `demoId` is "demo1" or "demo2", THE Demo_Manager SHALL substitute the demo repository URL and proceed with standard analysis
4. WHEN `demoId` is invalid, THE Demo_Manager SHALL return HTTP 400 with error code `INVALID_DEMO_ID`
5. THE Demo_Manager SHALL store demo configuration in environment or configuration file
6. DEMO repositories SHALL complete analysis within 30 seconds for optimal user experience

---

### Requirement 12: Handle Rate Limiting and Errors Gracefully

**User Story:** As a system, I want to handle GitHub API errors gracefully, so that the user experience degrades predictably.

#### Acceptance Criteria

1. WHEN GitHub API returns a rate-limit error (HTTP 403 with X-RateLimit-Remaining header = 0), THE Error_Handler SHALL return HTTP 429 with error code `GITHUB_RATE_LIMIT`
2. WHEN GitHub API returns authentication error, THE Error_Handler SHALL return HTTP 401 with error code `INVALID_GITHUB_TOKEN`
3. WHEN GitHub API returns 4xx error, THE Error_Handler SHALL return HTTP 400 with error code `GITHUB_REQUEST_ERROR` and original error message
4. WHEN GitHub API returns 5xx error, THE Error_Handler SHALL return HTTP 503 with error code `GITHUB_SERVICE_UNAVAILABLE`
5. WHEN processing times out after 60 seconds, THE Error_Handler SHALL return HTTP 504 with error code `REQUEST_TIMEOUT`
6. ALL error responses SHALL include a human-readable `message` and technical `details` object

---

### Requirement 13: Validate Response Structure and Data Types

**User Story:** As a developer, I want guaranteed data types, so that my client code is type-safe.

#### Acceptance Criteria

1. ALL Node objects SHALL have the following type structure:
   ```typescript
   {
     id: string;
     path: string;
     name: string;
     language: string;
     rotScore: number; // 0-100
     linesOfCode: number; // >= 0
     summaryMetrics: {
       nestingDepth: number;
       commentRatio: number;
       fileSize: number;
     };
     rawContent: string;
     isTruncated: boolean;
     importCount: number;
     exportCount: number;
     analyzedAt: string;
   }
   ```
2. ALL Edge objects SHALL have the following type structure:
   ```typescript
   {
     id: string;
     source: string;
     target: string;
     type: "import" | "require" | "export";
     label: string;
   }
   ```
3. WHEN a response is returned, THE Type_Validator SHALL ensure all numeric fields are finite and non-NaN
4. WHEN a response is returned, THE Type_Validator SHALL ensure all string fields are non-null and properly encoded
5. WHEN a response is returned, THE Type_Validator SHALL ensure Code_Rot_Score is between 0 and 100 inclusive

---

### Requirement 14: Support Authentication via Environment Variables

**User Story:** As a deployer, I want to use GitHub tokens securely, so that API limits are increased and private data can be handled.

#### Acceptance Criteria

1. THE Ingest_API SHALL check for `process.env.GITHUB_TOKEN` environment variable
2. WHEN GITHUB_TOKEN is defined, THE GitHub_Client SHALL include it in request headers as `Authorization: token {token}`
3. WHEN GITHUB_TOKEN is defined, GitHub REST API calls SHALL have higher rate limits (5000 requests/hour vs 60 requests/hour)
4. WHEN GITHUB_TOKEN is not defined, THE GitHub_Client SHALL proceed with unauthenticated requests
5. THE Ingest_API SHALL not log or expose the GITHUB_TOKEN value in any response or error message
6. WHEN GITHUB_TOKEN is invalid or expired, THE GitHub_Client SHALL return HTTP 401 with error code `INVALID_GITHUB_TOKEN`

---

### Requirement 15: Document API Request and Response Format

**User Story:** As a client developer, I want clear API documentation, so that I can integrate correctly.

#### Acceptance Criteria

1. THE API Documentation SHALL specify the request format:
   ```json
   {
     "repositoryUrl": "https://github.com/owner/repo",
     "useDemo": false,
     "demoId": null
   }
   ```
   OR
   ```json
   {
     "useDemo": true,
     "demoId": "demo1"
   }
   ```
2. THE API Documentation SHALL specify the response format for successful requests
3. THE API Documentation SHALL list all possible error codes with HTTP status codes
4. THE API Documentation SHALL include example curl or fetch commands for testing

---

## Testing Strategy

### Unit Test Scenarios

1. **URL Validation**: Test valid GitHub URLs, invalid URLs, non-GitHub URLs
2. **File Filtering**: Test selection of code files, extension filtering, file count limiting
3. **Relationship Detection**: Test import/export detection in TS, JS, and Python files
4. **Code-Rot Scoring**: Test score calculation with various file metrics
5. **Type Validation**: Ensure response types match specification

### Integration Test Scenarios

1. **End-to-End with Demo**: Test complete flow with demo1 and demo2 repositories
2. **Real Repository**: Test with small public GitHub repository
3. **Error Handling**: Test API error responses and graceful degradation
4. **Rate Limiting**: Verify rate-limit headers are handled correctly

### Property-Based Tests (Recommended)

1. **Code-Rot Invariant**: FOR ALL files, Code_Rot_Score SHALL be between 0 and 100 (always true)
2. **Node-Edge Consistency**: FOR ALL edges, both source and target nodes SHALL exist in the nodes array
3. **Relationship Round-Trip**: FOR ALL detected imports in files, the reverse edge SHALL be detectable by analyzing target file

---

## Open Questions for User Feedback

1. **Demo Repository Selection**: Should I use specific public repositories (e.g., Next.js, Flask) or would you prefer different examples?
2. **Code-Rot Scoring Formula**: Does the proposed formula (base 50 + size penalty + nesting penalty - comment reward) align with your vision, or should metrics be weighted differently?
3. **Truncation Strategy**: Is 4000 characters for `rawContent` appropriate, or should it be adjusted based on typical code file sizes?
4. **Parallelism**: Is a maximum concurrency of 5 parallel requests for content fetching acceptable, or should it be higher/lower?
5. **File Limit**: Is 25 files maximum a good balance between comprehensive analysis and API performance, or would you prefer a different limit?

---

## Acceptance and Sign-Off

**Requirements Author**: AI-Generated  
**Status**: Ready for Review  
**Last Updated**: 2026-11-01  
**Version**: 1.0
