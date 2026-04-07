import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { calculerConges, calculerFractionnement } from "./calcul";
import type { ResultatFractionnement } from "./calcul";
import type { DemandeConge, Compteurs } from "./types";
import "./App.css";

const TOTAL_INITIAL = 33;
const SEMAINE_INITIAL = 28;
const SAMEDIS_INITIAL = 5;
const STORAGE_KEY = "conges-cnetp-demandes";

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

function App() {
  const [demandes, setDemandes] = useState<DemandeConge[]>(charger);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [erreur, setErreur] = useState("");
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null);
  const dateDebutRef = useRef<HTMLInputElement>(null);

  const majDemandes = useCallback((fn: (prev: DemandeConge[]) => DemandeConge[]) => {
    setDemandes((prev) => {
      const next = fn(prev);
      sauvegarder(next);
      return next;
    });
  }, []);

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
    return {
      totalInitial: TOTAL_INITIAL + bonus,
      semaineInitial: SEMAINE_INITIAL + bonus,
      samedisInitial: SAMEDIS_INITIAL,
      semainePris,
      samedisPris,
      fractionnement: bonus,
      semaineRestant: SEMAINE_INITIAL + bonus - semainePris,
      samedisRestant: SAMEDIS_INITIAL - samedisPris,
      totalRestant: TOTAL_INITIAL + bonus - semainePris - samedisPris,
    };
  }, [demandes, fractionnement]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");

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

    const result = calculerConges(debut, fin, compteurs.samedisRestant);

    if (result.erreur) {
      setErreur(result.erreur);
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
          erreurs.push(`Ligne ${i + 1} : dates invalides (${sDebut} / ${sFin})`);
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

  return (
    <div className="app">
      <header>
        <h1>Congés CNETP Cadre</h1>
        <p className="subtitle">
          Convention Collective des Travaux Publics · Jours ouvrables
        </p>
      </header>

      <section className="dashboard">
        <div className="card total">
          <div className="card-label">Total restant</div>
          <div className="card-value">{compteurs.totalRestant}</div>
          <div className="card-sub">/ {compteurs.totalInitial} jours</div>
        </div>
        <div className="card semaine">
          <div className="card-label">Semaine (L-V)</div>
          <div className="card-value">{compteurs.semaineRestant}</div>
          <div className="card-sub">/ {compteurs.semaineInitial} jours</div>
        </div>
        <div className="card samedis">
          <div className="card-label">Samedis</div>
          <div className="card-value">{compteurs.samedisRestant}</div>
          <div className="card-sub">/ {SAMEDIS_INITIAL} jours</div>
        </div>
        <div className="card fractionnement">
          <div className="card-label">Fractionnement</div>
          <div className="card-value">+{fractionnement.bonus}</div>
          <div className="card-sub">{fractionnement.explication}</div>
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
      </section>

      {dateDebut && dateFin && !erreur && (
        <Apercu dateDebut={dateDebut} dateFin={dateFin} samedisRestants={compteurs.samedisRestant} />
      )}

      <section className="historique">
        <div className="historique-header">
          <h2>Historique</h2>
          <div className="historique-actions">
            <label className="btn-import">
              Importer
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={importerCSV}
                hidden
              />
            </label>
            {demandes.length > 0 && (
              <button className="btn-export" onClick={exporterCSV}>
                Exporter
              </button>
            )}
          </div>
        </div>

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
        <p>
          30 jours légaux + 3 ancienneté = 33 ouvrables (28 sem + 5 sam) +
          fractionnement
        </p>
      </footer>
    </div>
  );
}

function Apercu({
  dateDebut,
  dateFin,
  samedisRestants,
}: {
  dateDebut: string;
  dateFin: string;
  samedisRestants: number;
}) {
  const result = useMemo(() => {
    const d = parseLocalDate(dateDebut);
    const f = parseLocalDate(dateFin);
    if (isNaN(d.getTime()) || isNaN(f.getTime()) || d > f) return null;
    return calculerConges(d, f, samedisRestants);
  }, [dateDebut, dateFin, samedisRestants]);

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
