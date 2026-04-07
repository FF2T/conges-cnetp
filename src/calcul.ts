import { estJourFerie } from "./joursFeries";

export interface DecompteDetail {
  date: Date;
  jourSemaine: string;
  type: "semaine" | "samedi" | "ferie" | "dimanche";
  decompte: boolean;
  commentaire: string;
}

export interface ResultatCalcul {
  joursSemaineDecomptes: number;
  samedisDecomptes: number;
  totalJoursDecomptes: number;
  details: DecompteDetail[];
  erreur?: string;
}

const JOURS_SEMAINE = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

/**
 * Calcule le décompte de jours de congé selon les règles CNETP Cadre.
 *
 * Règles jours ouvrables :
 * - Jours ouvrables = Lundi à Samedi (6j/semaine)
 * - Seuls les jours ouvrables DANS la période (début → fin) sont décomptés
 * - Jours fériés sur jour ouvrable : non décomptés
 * - Dimanches : non décomptés
 * - Pas d'ajout automatique du samedi après un vendredi
 */
export function calculerConges(
  debut: Date,
  fin: Date
): ResultatCalcul {
  if (debut > fin) {
    return {
      joursSemaineDecomptes: 0,
      samedisDecomptes: 0,
      totalJoursDecomptes: 0,
      details: [],
      erreur: "La date de début doit être antérieure à la date de fin.",
    };
  }

  const details: DecompteDetail[] = [];
  let joursSemaineDecomptes = 0;
  let samedisDecomptes = 0;

  const current = new Date(debut);
  while (current <= fin) {
    const dow = current.getDay();
    const nomJour = JOURS_SEMAINE[dow];
    const ferie = estJourFerie(current);
    const jour = new Date(current);

    if (dow === 0) {
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "dimanche",
        decompte: false,
        commentaire: "Dimanche — non ouvrable",
      });
    } else if (ferie) {
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "ferie",
        decompte: false,
        commentaire: "Jour férié — non décompté",
      });
    } else if (dow === 6) {
      samedisDecomptes++;
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "samedi",
        decompte: true,
        commentaire: "Samedi inclus dans la période",
      });
    } else {
      joursSemaineDecomptes++;
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "semaine",
        decompte: true,
        commentaire: "Jour ouvrable décompté",
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return {
    joursSemaineDecomptes,
    samedisDecomptes,
    totalJoursDecomptes: joursSemaineDecomptes + samedisDecomptes,
    details,
  };
}

/**
 * Calcule les jours de fractionnement.
 *
 * Règle : on regarde le nombre de jours ouvrables pris
 * en dehors de la période légale (1er mai → 31 octobre).
 * - Si >= 6 jours hors période → 2 jours bonus
 * - Si 3 à 5 jours hors période → 1 jour bonus
 * - Sinon → 0
 */
export interface ResultatFractionnement {
  joursPrisHorsPeriode: number;
  joursPrisEnPeriode: number;
  bonus: number;
  explication: string;
}

export function calculerFractionnement(
  demandes: { dateDebut: Date; dateFin: Date; totalJours: number; details: DecompteDetail[] }[],
  annee: number
): ResultatFractionnement {
  const debutPeriode = new Date(annee, 4, 1);  // 1er mai
  const finPeriode = new Date(annee, 9, 31);   // 31 octobre

  let joursPrisEnPeriode = 0;
  let joursPrisHorsPeriode = 0;

  for (const demande of demandes) {
    for (const det of demande.details) {
      if (!det.decompte) continue;
      const d = det.date;
      if (d >= debutPeriode && d <= finPeriode) {
        joursPrisEnPeriode++;
      } else {
        joursPrisHorsPeriode++;
      }
    }
  }

  let bonus: number;
  let explication: string;

  if (joursPrisHorsPeriode >= 6) {
    bonus = 2;
    explication = `${joursPrisHorsPeriode} jour(s) hors période légale → +2j`;
  } else if (joursPrisHorsPeriode >= 3) {
    bonus = 1;
    explication = `${joursPrisHorsPeriode} jour(s) hors période légale → +1j`;
  } else {
    bonus = 0;
    explication = `${joursPrisHorsPeriode} jour(s) hors période légale → +0j`;
  }

  return { joursPrisHorsPeriode, joursPrisEnPeriode, bonus, explication };
}
