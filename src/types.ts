export interface ChangedFile {
  filename: string;
  status: string;
  patch: string | undefined;
  additions: number;
  deletions: number;
}

export interface DocFile {
  filepath: string;
  content: string;
  priority: number;
}

export interface DocRecommendation {
  type: "update" | "create";
  file: string;
  startLine?: number;
  endLine?: number;
  suggestedContent?: string;
  reasoning: string;
}
