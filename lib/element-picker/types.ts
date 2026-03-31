export interface ElementInfo {
  selector: string;
  xpath: string;
  tagName: string;
  id: string;
  classes: string[];
  textContent: string;
  parentChain: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  siblings: SiblingInfo[];
  attributes: Record<string, string>;
}

export interface SiblingInfo {
  position: "before" | "after";
  tagName: string;
  classes: string[];
  textContent: string;
}
