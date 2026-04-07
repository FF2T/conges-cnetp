import { useState, useMemo, useRef, useCallback } from "react";
import { calculerConges, calculerFractionnement } from "./calcul";
import type { ResultatFractionnement } from "./calcul";
import type { DemandeConge, Compteurs } from "./types";
import "./App.css";

const SEMAINE_LEGAUX = 25; // 30 ouvrables = 25 sem (L-V) + 5 sam
const SAMEDIS_INITIAL = 5;
const STORAGE_KEY = "conges-cnetp-demandes";
const SETTINGS_KEY = "conges-cnetp-settings";

interface Settings {
  dateEntree: string; // JJ/MM/AA ou YYYY-MM-DD
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(s: string): Date {
  if (s.includes("/")) {
    const parts = s.split("/").map(Number);
    if (parts.length !== 3) return new Date(NaN);
    let [d, m, y] = parts;
    if (y < 100) y += 2000;
    return new Date(y, m - 1, d);
  }
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Calcule les jours d'ancienneté selon la CC Travaux Publics (Cadres/ETAM) */
function calculerAnciennete(dateEntree: string): { annees: number; joursBonus: number } {
  if (!dateEntree) return { annees: 0, joursBonus: 0 };
  const d = parseLocalDate(dateEntree);
  if (isNaN(d.getTime())) return { annees: 0, joursBonus: 0 };

  const now = new Date();
  let annees = now.getFullYear() - d.getFullYear();
  if (
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
  ) {
    annees--;
  }
  if (annees < 0) annees = 0;

  // CC Travaux Publics — Cadres
  let joursBonus = 0;
  if (annees >= 10) joursBonus = 3;
  else if (annees >= 5) joursBonus = 2;

  return { annees, joursBonus };
}

function sauvegarder(demandes: DemandeConge[]) {
  const data = demandes.map((d) => ({
    ...d,
    dateDebut: formatDateISO(d.dateDebut),
    dateFin: formatDateISO(d.dateFin),
    creeLe: d.creeLe.toISOString(),
    details: d.details.map((det) => ({
      ...det,
      date: formatDateISO(det.date),
    })),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function charger(): DemandeConge[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return data.map((d: any) => ({
      ...d,
      dateDebut: parseLocalDate(d.dateDebut),
      dateFin: parseLocalDate(d.dateFin),
      creeLe: new Date(d.creeLe),
      details: d.details.map((det: any) => ({
        ...det,
        date: parseLocalDate(det.date),
      })),
    }));
  } catch {
    return [];
  }
}

function chargerSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { dateEntree: "" };
    return JSON.parse(raw);
  } catch {
    return { dateEntree: "" };
  }
}

function sauvegarderSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function App() {
  const [demandes, setDemandes] = useState<DemandeConge[]>(charger);
  const [settings, setSettings] = useState<Settings>(chargerSettings);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [erreur, setErreur] = useState("");
  const [avertissement, setAvertissement] = useState("");
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const dateDebutRef = useRef<HTMLInputElement>(null);

  const majDemandes = useCallback((fn: (prev: DemandeConge[]) => DemandeConge[]) => {
    setDemandes((prev) => {
      const next = fn(prev);
      sauvegarder(next);
      return next;
    });
  }, []);

  const anciennete = useMemo(
    () => calculerAnciennete(settings.dateEntree),
    [settings.dateEntree]
  );

  const SEMAINE_INITIAL = SEMAINE_LEGAUX + anciennete.joursBonus;
  const TOTAL_INITIAL = SEMAINE_INITIAL + SAMEDIS_INITIAL;

  const fractionnement: ResultatFractionnement = useMemo(() => {
    const annee = new Date().getFullYear();
    return calculerFractionnement(demandes, annee);
  }, [demandes]);

  const compteurs: Compteurs = useMemo(() => {
    let semainePris = 0;
    let samedisPris = 0;
    for (const d of demandes) {
      semainePris += d.joursSemaine;
      samedisPris += d.samedis;
    }
    const bonus = fractionnement.bonus;
    // Si plus de samedis pris que disponibles, le surplus mange les jours semaine
    const samedisDebord = Math.max(0, samedisPris - SAMEDIS_INITIAL);
    const samedisRestant = Math.max(0, SAMEDIS_INITIAL - samedisPris);
    const semaineRestant = Math.max(0, SEMAINE_INITIAL + bonus - semainePris - samedisDebord);
    return {
      totalInitial: TOTAL_INITIAL + bonus,
      semaineInitial: SEMAINE_INITIAL + bonus,
      samedisInitial: SAMEDIS_INITIAL,
      semainePris,
      samedisPris,
      fractionnement: bonus,
      semaineRestant,
      samedisRestant,
      totalRestant: semaineRestant + samedisRestant,
    };
  }, [demandes, fractionnement, SEMAINE_INITIAL, TOTAL_INITIAL]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    setAvertissement("");

    if (!dateDebut) {
      setErreur("Veuillez saisir la date de début.");
      return;
    }

    if (!dateFin) {
      setErreur("Veuillez saisir la date de fin.");
      return;
    }

    const debut = parseLocalDate(dateDebut);
    const fin = parseLocalDate(dateFin);

    if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
      setErreur("Format de date invalide. Utilisez JJ/MM/AA.");
      return;
    }

    if (debut.getDay() === 0 || debut.getDay() === 6) {
      setErreur(
        "La date de début doit être un jour de semaine (lundi à vendredi)."
      );
      return;
    }

    const result = calculerConges(debut, fin);

    if (result.erreur) {
      setErreur(result.erreur);
      return;
    }

    if (result.samedisDecomptes > 0 && compteurs.samedisRestant === 0) {
      setAvertissement(
        `Attention : votre solde samedis est à 0. Le(s) ${result.samedisDecomptes} samedi(s) de cette période ne sera/seront pas décompté(s). Pensez à ajuster vos dates (ex: terminer au vendredi).`
      );
      // On retire les samedis du décompte
      result.samedisDecomptes = 0;
      result.totalJoursDecomptes = result.joursSemaineDecomptes;
      for (const det of result.details) {
        if (det.type === "samedi" && det.decompte) {
          det.decompte = false;
          det.commentaire = "Samedi non décompté — solde samedis épuisé";
        }
      }
    } else if (result.samedisDecomptes > compteurs.samedisRestant) {
      setErreur(
        `Solde samedis insuffisant ! Cette demande contient ${result.samedisDecomptes} samedi(s) mais il n'en reste que ${compteurs.samedisRestant}.`
      );
      return;
    }

    if (result.joursSemaineDecomptes > compteurs.semaineRestant) {
      setErreur(
        `Solde jours semaine insuffisant ! Cette demande nécessite ${result.joursSemaineDecomptes} jour(s) mais il n'en reste que ${compteurs.semaineRestant}.`
      );
      return;
    }

    const demande: DemandeConge = {
      id: crypto.randomUUID(),
      dateDebut: debut,
      dateFin: fin,
      joursSemaine: result.joursSemaineDecomptes,
      samedis: result.samedisDecomptes,
      totalJours: result.totalJoursDecomptes,
      details: result.details,
      creeLe: new Date(),
    };

    majDemandes((prev) => [...prev, demande]);
    setDateDebut("");
    setDateFin("");
    requestAnimationFrame(() => dateDebutRef.current?.focus());
  }

  function supprimerDemande(id: string) {
    majDemandes((prev) => prev.filter((d) => d.id !== id));
  }

  function importerCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lignes = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const nouvelles: DemandeConge[] = [];
      const erreurs: string[] = [];

      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i];
        if (ligne.startsWith("Date début")) continue;
        if (ligne.startsWith("Total pris") || ligne.startsWith("Solde restant")) continue;

        const cols = ligne.split(";");
        if (cols.length < 2) continue;

        const [sDebut, sFin] = cols;
        const debut = parseLocalDate(sDebut);
        const fin = parseLocalDate(sFin);

        if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
          erreurs.push(`Ligne ${i + 1} : dates invalides`);
          continue;
        }

        const result = calculerConges(debut, fin);
        if (result.erreur) {
          erreurs.push(`Ligne ${i + 1} : ${result.erreur}`);
          continue;
        }

        nouvelles.push({
          id: crypto.randomUUID(),
          dateDebut: debut,
          dateFin: fin,
          joursSemaine: result.joursSemaineDecomptes,
          samedis: result.samedisDecomptes,
          totalJours: result.totalJoursDecomptes,
          details: result.details,
          creeLe: new Date(),
        });
      }

      if (nouvelles.length === 0) {
        setErreur(
          erreurs.length > 0
            ? `Import échoué : ${erreurs.join(" | ")}`
            : "Aucune ligne valide trouvée dans le fichier."
        );
      } else {
        majDemandes((prev) => [...prev, ...nouvelles]);
        setErreur(
          erreurs.length > 0
            ? `${nouvelles.length} congé(s) importé(s). Erreurs ignorées : ${erreurs.join(" | ")}`
            : ""
        );
      }

      e.target.value = "";
    };
    reader.readAsText(file);
  }

  function exporterCSV() {
    const lignes = [
      "Date début;Date fin;Jours CNETP;Jours Semaine (L-V);Samedis décomptés",
    ];
    for (const d of demandes) {
      lignes.push(
        `${formatDateISO(d.dateDebut)};${formatDateISO(d.dateFin)};${d.totalJours};${d.joursSemaine};${d.samedis}`
      );
    }
    lignes.push("");
    lignes.push(
      `Total pris;;;${compteurs.semainePris};${compteurs.samedisPris}`
    );
    lignes.push(
      `Solde restant;;;${compteurs.semaineRestant};${compteurs.samedisRestant}`
    );

    const blob = new Blob([lignes.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conges-cnetp.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSettingsDateEntree(val: string) {
    const next = { ...settings, dateEntree: val };
    setSettings(next);
    sauvegarderSettings(next);
  }

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <h1>Mes Congés</h1>
          <button
            className="btn-settings"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? "Fermer" : "Paramètres"}
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="settings-panel">
          <h2>Paramètres</h2>

          <div className="settings-group">
            <label className="settings-label">
              Date d'entrée dans l'entreprise
              <input
                type="text"
                placeholder="JJ/MM/AA"
                value={settings.dateEntree}
                onChange={(e) => handleSettingsDateEntree(e.target.value)}
              />
            </label>
            {anciennete.annees > 0 && (
              <p className="settings-info">
                {anciennete.annees} an(s) d'ancienneté → <strong>+{anciennete.joursBonus} jour(s)</strong> supplémentaire(s)
              </p>
            )}
            <p className="settings-help">
              CC Travaux Publics Cadres : +2j dès 5 ans, +3j dès 10 ans
            </p>
          </div>

          <div className="settings-group">
            <h3>Import / Export</h3>
            <div className="settings-btns">
              <label className="btn-import">
                Importer CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={importerCSV}
                  hidden
                />
              </label>
              {demandes.length > 0 && (
                <button className="btn-export" onClick={exporterCSV}>
                  Exporter CSV
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="explication">
        <div className="expli-line acquis">
          <span className="expli-label">Acquis</span>
          <span className="expli-detail">
            30 ouvrables
            {anciennete.joursBonus > 0 && <> + {anciennete.joursBonus} ancienneté</>}
            {fractionnement.bonus > 0 && <> + {fractionnement.bonus} fractionnement</>}
          </span>
          <span className="expli-total">{compteurs.totalInitial}j</span>
        </div>
        <div className="expli-line pris">
          <span className="expli-label">Pris</span>
          <span className="expli-detail">
            {compteurs.semainePris} sem + {compteurs.samedisPris} sam
          </span>
          <span className="expli-total">{compteurs.semainePris + compteurs.samedisPris}j</span>
        </div>
        <div className="expli-line solde">
          <span className="expli-label">Solde</span>
          <span className="expli-detail">
            {compteurs.semaineRestant} sem + {compteurs.samedisRestant} sam
          </span>
          <span className="expli-total">{compteurs.totalRestant}j</span>
        </div>
      </section>

      <section className="dashboard">
        <div className="card solde-card">
          <div className="card-label">Jours restants</div>
          <div className="card-value">{compteurs.semaineRestant}</div>
          <div className="card-sub">
            {compteurs.totalRestant} jours au total dont {compteurs.samedisRestant} samedi{compteurs.samedisRestant > 1 ? "s" : ""}
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2>Nouvelle demande</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Début
              <input
                ref={dateDebutRef}
                tabIndex={1}
                type="text"
                placeholder="JJ/MM/AA"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </label>
            <label>
              Fin
              <input
                tabIndex={2}
                type="text"
                placeholder="JJ/MM/AA"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </label>
            <button tabIndex={3} type="submit" className="btn-primary">
              Ajouter
            </button>
          </div>
        </form>
        {erreur && <div className="erreur">{erreur}</div>}
        {avertissement && <div className="avertissement">{avertissement}</div>}
      </section>

      {dateDebut && dateFin && !erreur && (
        <Apercu dateDebut={dateDebut} dateFin={dateFin} />
      )}

      <section className="historique">
        <h2>Historique</h2>

        {demandes.length === 0 ? (
          <p className="empty">Aucun congé enregistré.</p>
        ) : (
          <>
            <div className="demandes-list">
              {demandes.map((d) => (
                <div key={d.id} className="demande-card">
                  <div className="demande-main">
                    <div className="demande-dates">
                      {formatDate(d.dateDebut)} → {formatDate(d.dateFin)}
                    </div>
                    <div className="demande-chiffres">
                      <span className="chip">{d.totalJours}j</span>
                      <span className="chip chip-sem">{d.joursSemaine} sem</span>
                      <span className="chip chip-sam">{d.samedis} sam</span>
                    </div>
                    <div className="demande-btns">
                      <button
                        className="btn-detail"
                        onClick={() =>
                          setDetailOuvert(detailOuvert === d.id ? null : d.id)
                        }
                      >
                        {detailOuvert === d.id ? "Masquer" : "Détail"}
                      </button>
                      <button
                        className="btn-suppr"
                        onClick={() => supprimerDemande(d.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  {detailOuvert === d.id && (
                    <div className="demande-detail">
                      <table className="detail-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Jour</th>
                            <th>Type</th>
                            <th>Dcp.</th>
                            <th>Commentaire</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.details.map((det, i) => (
                            <tr
                              key={i}
                              className={det.decompte ? "" : "non-decompte"}
                            >
                              <td>{formatDate(det.date)}</td>
                              <td>{det.jourSemaine}</td>
                              <td>{det.type}</td>
                              <td>{det.decompte ? "Oui" : "Non"}</td>
                              <td>{det.commentaire}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="totaux">
              <strong>Total pris :</strong>{" "}
              {compteurs.semainePris + compteurs.samedisPris}j
              ({compteurs.semainePris} sem + {compteurs.samedisPris} sam)
            </div>
          </>
        )}
      </section>

      <footer>
        <p>CNETP Cadre · Décompte en jours ouvrables</p>
      </footer>
    </div>
  );
}

function Apercu({
  dateDebut,
  dateFin,
}: {
  dateDebut: string;
  dateFin: string;
}) {
  const result = useMemo(() => {
    const d = parseLocalDate(dateDebut);
    const f = parseLocalDate(dateFin);
    if (isNaN(d.getTime()) || isNaN(f.getTime()) || d > f) return null;
    return calculerConges(d, f);
  }, [dateDebut, dateFin]);

  if (!result || result.erreur) return null;

  return (
    <section className="apercu">
      <h3>Apercu</h3>
      <div className="apercu-grid">
        <span>
          Semaine : <strong>{result.joursSemaineDecomptes}</strong>
        </span>
        <span>
          Samedis : <strong>{result.samedisDecomptes}</strong>
        </span>
        <span>
          Total : <strong>{result.totalJoursDecomptes}</strong>
        </span>
      </div>
      <table className="detail-table apercu-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Jour</th>
            <th>Dcp.</th>
            <th>Commentaire</th>
          </tr>
        </thead>
        <tbody>
          {result.details.map((det, i) => (
            <tr key={i} className={det.decompte ? "" : "non-decompte"}>
              <td>
                {det.date.toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </td>
              <td>{det.jourSemaine}</td>
              <td>{det.decompte ? "Oui" : "Non"}</td>
              <td>{det.commentaire}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default App;
