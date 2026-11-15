import HistoryView from "./components/HistoryView";
import styles from "./page.module.css";

// Vista de historia: calendario año x mes. Los datos se cargan en el navegador.
export default function Home() {
  return (
    <main className={styles.main}>
      <HistoryView />
    </main>
  );
}
