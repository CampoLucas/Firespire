export type StageName = "globe" | "approach" | "intro" | "entering" | "board" | "travel" | "evidence" | "returning";

export interface MuseumState {
  stage: StageName;
  session: number;
  motion: number;
  target: string | null;
}

export type MuseumEvent = {
  type: "select" | "arrived" | "start" | "board" | "focus" | "settle" | "exit" | "restored" | "navigate";
  pose?: { x: number; y: number; scale: number; roll: number };
  id?: string | null;
  force?: boolean;
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

// ---- Eventos curados reales (D-14) ----

export type CuratedKind = "article" | "report" | "satellite" | "chart" | "context" | "method" | "event";

/** Bloques de contenido de una tarjeta curada; se renderizan siempre con DOM APIs. */
export type Block =
  | { t: "p"; text: string }
  | { t: "quote"; text: string }
  | { t: "fields"; rows: [string, string][] }
  | {
      t: "chart";
      label: string;
      dates: string[];
      series: { key: "modis" | "viirs" | "harmonized"; label: string; values: (number | null)[] }[];
    };

export interface HelpData {
  status: string;
  role: string;
  retrieval?: string;
  relation?: string;
  limits?: string;
}

export interface CuratedEvidence {
  id: string;
  kind: CuratedKind;
  title: string;
  isMock: false;
  typeLabel: string;
  source: {
    id: string;
    name: string;
    date: string;
    /** https para article/report; ruta same-origin /artifacts/... para tarjetas calculadas. */
    url: string;
    verification: "curated";
  };
  /** Solo article/report: habilita el enlace "Open original source". */
  link?: boolean;
  placement: Placement;
  blocks: Block[];
  help: HelpData;
  sourceHelp: HelpData;
}

export interface CuratedExhibit {
  id: string;
  isMock: false;
  marker: "square" | "diamond";
  approximate: boolean;
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
  artifactVersion: string;
  match: { verdict: "overlap" | "weak" | "none"; regime: string | null; k: number | null };
  items: CuratedEvidence[];
  edges: { from: string; to: string }[];
  help: { waypoint: HelpData; intro: HelpData; board: HelpData };
}
