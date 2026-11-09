export type Selection =
  | { type: "camera"; id: string }
  | { type: "drone" }
  | { type: "resource" }
  | { type: "station" }
  | { type: "incident" }
  | { type: "packet" }
  | { type: "event"; id: string }
  | null;
