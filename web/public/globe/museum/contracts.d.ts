export type StageName = "globe" | "approach" | "intro" | "entering" | "board" | "travel" | "evidence" | "returning";

export interface MuseumState {
  stage: StageName;
  session: number;
  motion: number;
  target: string | null;
}

export type MuseumEvent = {
  type: "select" | "arrived" | "start" | "board" | "focus" | "settle" | "exit" | "restored";
  id?: string | null;
  session?: number;
  motion?: number;
};

export type EvidenceKind = "article" | "report" | "photo" | "satellite";

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface MockEvidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  isMock: true;
  source: {
    id: string;
    name: string;
    date: string;
    url: null;
    isMock: true;
    verification: "fictional";
  };
  placement: Placement;
  body?: string[];
  image?: string;
  alt?: string;
  caption?: string;
  fields?: [string, string][];
}

export interface MockExhibit {
  id: string;
  isMock: true;
  marker: "square" | "diamond";
  origin: string;
  short: string;
  title: string;
  region: string;
  lat: number;
  lng: number;
  altitude: number;
  period: string;
  summary: string;
  boardNote: string;
  items: MockEvidence[];
  edges: {
    from: string;
    to: string;
    label: string;
    basis: string;
    via: [number, number];
    guides?: [[number, number], [number, number]];
    isMock: true;
  }[];
}

export interface Annotation {
  status: string;
  role: string;
  retrieval?: string;
  relation?: string;
  limits?: string;
}

export interface BoardPose {
  x: number;
  y: number;
  scale: number;
  roll: number;
}
