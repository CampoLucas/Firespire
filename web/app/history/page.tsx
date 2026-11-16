import type { Metadata } from "next";
import HistoryView from "../components/HistoryView";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Harmonized history · Museum of Fire",
  description:
    "MODIS and VIIRS satellite fire hotspots in Argentina, harmonized into one consistent monthly history.",
};

// Vista de historia: calendario año x mes. Los datos se cargan en el navegador.
// El globo es la portada ("/"): next.config.ts reescribe "/" a /globe/index.html.
export default function HistoryPage() {
  return (
    <main className={styles.main}>
      <HistoryView />
    </main>
  );
}
