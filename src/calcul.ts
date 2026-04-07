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
 * - Si le vendredi est férié, le samedi suivant n'est pas décompté
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
      // Si le vendredi précédent est férié, le samedi n'est pas ouvrable
      const vendredi = new Date(current);
      vendredi.setDate(vendredi.getDate() - 1);
      if (estJourFerie(vendredi)) {
        details.push({
          date: jour,
          jourSemaine: nomJour,
          type: "samedi",
          decompte: false,
          commentaire: "Samedi non décompté — vendredi férié",
        });
      } else {
        samedisDecomptes++;
        details.push({
          date: jour,
          jourSemaine: nomJour,
          type: "samedi",
          decompte: true,
          commentaire: "Samedi inclus dans la période",
        });
      }
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
 * Règles (CC Travaux Publics) :
 * - Seuls les 24 premiers jours (congé principal, 4 semaines) comptent.
 *   La 5e semaine (6 jours) est exclue du calcul.
 * - Il faut qu'au moins 12 jours continus aient été pris entre le 1er mai
 *   et le 31 octobre pour ouvrir le droit au fractionnement.
 * - On compte les jours du congé principal pris HORS période légale (1/05–31/10).
 * - 3 à 5 jours hors période → +1 jour
 * - >= 6 jours hors période → +2 jours
 */
export interface ResultatFractionnement {
  joursPrisHorsPeriode: number;
  joursPrisEnPeriode: number;
  maxJoursContinus: number;
  bonus: number;
  explication: string;
}

export function calculerFractionnement(
  demandes: { dateDebut: Date; dateFin: Date; totalJours: number; details: DecompteDetail[] }[]
): ResultatFractionnement {
  // Période légale = mai à octobre, quelle que soit l'année
  function estEnPeriodeLegale(d: Date): boolean {
    const mois = d.getMonth(); // 0-indexed: 4=mai, 9=octobre
    return mois >= 4 && mois <= 9;
  }

  // Collecter tous les jours décomptés
  const tousJoursDecomptes: { date: Date; enPeriode: boolean }[] = [];
  for (const demande of demandes) {
    for (const det of demande.details) {
      if (!det.decompte) continue;
      tousJoursDecomptes.push({
        date: det.date,
        enPeriode: estEnPeriodeLegale(det.date),
      });
    }
  }

  // Ne considérer que les 24 premiers jours (congé principal)
  // La 5e semaine (au-delà de 24) est exclue du fractionnement
  const joursCongesPrincipal = tousJoursDecomptes.slice(0, 24);

  let joursPrisEnPeriode = 0;
  let joursPrisHorsPeriode = 0;
  for (const j of joursCongesPrincipal) {
    if (j.enPeriode) {
      joursPrisEnPeriode++;
    } else {
      joursPrisHorsPeriode++;
    }
  }

  // Vérifier qu'au moins 12 jours ouvrables continus ont été pris en période légale.
  // On cherche la demande avec le plus de jours décomptés en période.
  let maxJoursContinus = 0;
  for (const demande of demandes) {
    let joursEnPeriode = 0;
    for (const det of demande.details) {
      if (!det.decompte) continue;
      if (estEnPeriodeLegale(det.date)) {
        joursEnPeriode++;
      }
    }
    if (joursEnPeriode > maxJoursContinus) maxJoursContinus = joursEnPeriode;
  }

  let bonus: number;
  let explication: string;

  if (maxJoursContinus < 12) {
    bonus = 0;
    explication = `Pas de congé principal de 12j continus en période légale (max ${maxJoursContinus}j)`;
  } else if (joursPrisHorsPeriode >= 6) {
    bonus = 2;
    explication = `${joursPrisHorsPeriode}j hors période (sur 24j principaux) → +2j`;
  } else if (joursPrisHorsPeriode >= 3) {
    bonus = 1;
    explication = `${joursPrisHorsPeriode}j hors période (sur 24j principaux) → +1j`;
  } else {
    bonus = 0;
    explication = `${joursPrisHorsPeriode}j hors période (sur 24j principaux) → +0j`;
  }

  return { joursPrisHorsPeriode, joursPrisEnPeriode, maxJoursContinus, bonus, explication };
}
