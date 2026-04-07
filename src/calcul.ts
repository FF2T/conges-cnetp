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
 * Calcule le décompte de jours de congé selon les règles CNETP.
 *
 * Règles :
 * - Jours ouvrables = Lundi à Samedi (6j/semaine)
 * - Jours fériés sur jour ouvrable : non décomptés
 * - Vendredi posé → samedi suivant automatiquement décompté
 * - Exception : si vendredi ET lundi suivant posés → le samedi est décompté
 *   du compteur "samedis" mais fait partie de la semaine complète (pas de pénalité)
 */
export function calculerConges(
  debut: Date,
  fin: Date,
  samedisRestants: number = Infinity
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

  // Étape 1 : Construire la liste de tous les jours de la période (début → fin)
  const tousLesJours: Date[] = [];
  const current = new Date(debut);
  while (current <= fin) {
    tousLesJours.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // Étape 2 : Identifier les vendredis posés et vérifier si le lundi suivant est aussi posé
  const dateSet = new Set(
    tousLesJours.map((d) => d.toISOString().slice(0, 10))
  );

  // Étape 3 : Collecter les samedis à ajouter (vendredis posés dont le samedi n'est pas dans la période)
  // On ne rajoute un samedi automatique que s'il reste des samedis disponibles (cadre)
  const samedisAjoutes: Date[] = [];
  let samedisDisponibles = samedisRestants;

  // Compter d'abord les samedis déjà dans la période d'origine
  for (const jour of tousLesJours) {
    if (jour.getDay() === 6 && !estJourFerie(jour)) {
      samedisDisponibles--;
    }
  }

  for (const jour of tousLesJours) {
    if (jour.getDay() === 5) {
      // Vendredi
      const samediSuivant = new Date(jour);
      samediSuivant.setDate(samediSuivant.getDate() + 1);
      const samKey = samediSuivant.toISOString().slice(0, 10);
      if (!dateSet.has(samKey) && !estJourFerie(samediSuivant) && samedisDisponibles > 0) {
        samedisAjoutes.push(samediSuivant);
        dateSet.add(samKey);
        samedisDisponibles--;
      }
    }
  }

  // Fusionner et trier
  const joursComplets = [...tousLesJours, ...samedisAjoutes].sort(
    (a, b) => a.getTime() - b.getTime()
  );

  // Étape 4 : Calculer le décompte pour chaque jour
  const details: DecompteDetail[] = [];
  let joursSemaineDecomptes = 0;
  let samedisDecomptes = 0;

  for (const jour of joursComplets) {
    const dow = jour.getDay(); // 0=Dim, 6=Sam
    const nomJour = JOURS_SEMAINE[dow];
    const ferie = estJourFerie(jour);

    if (dow === 0) {
      // Dimanche : jamais décompté
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "dimanche",
        decompte: false,
        commentaire: "Dimanche — non ouvrable",
      });
    } else if (ferie) {
      // Jour férié : non décompté
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "ferie",
        decompte: false,
        commentaire: "Jour férié — non décompté",
      });
    } else if (dow === 6) {
      // Samedi
      const estDansPeriodeOrigine = tousLesJours.some(
        (d) => d.toISOString().slice(0, 10) === jour.toISOString().slice(0, 10)
      );
      const vendrediPrecedent = new Date(jour);
      vendrediPrecedent.setDate(vendrediPrecedent.getDate() - 1);
      const lundiSuivant = new Date(jour);
      lundiSuivant.setDate(lundiSuivant.getDate() + 2);

      const vendrediPose = dateSet.has(
        vendrediPrecedent.toISOString().slice(0, 10)
      );
      const lundiPose = dateSet.has(
        lundiSuivant.toISOString().slice(0, 10)
      );

      if (ferie) {
        // déjà géré au-dessus, mais garde pour clarté
      } else {
        samedisDecomptes++;
        let commentaire: string;
        if (!estDansPeriodeOrigine) {
          commentaire =
            "Samedi ajouté automatiquement (vendredi posé)";
        } else if (vendrediPose && lundiPose) {
          commentaire =
            "Samedi — semaine complète (ven+lun posés)";
        } else {
          commentaire = "Samedi inclus dans la période";
        }
        details.push({
          date: jour,
          jourSemaine: nomJour,
          type: "samedi",
          decompte: true,
          commentaire,
        });
      }
    } else {
      // Lundi à Vendredi : décompté
      joursSemaineDecomptes++;
      let commentaire = "Jour ouvrable décompté";
      if (dow === 5) {
        const samediSuivant = new Date(jour);
        samediSuivant.setDate(samediSuivant.getDate() + 1);
        const samKey = samediSuivant.toISOString().slice(0, 10);
        const samFerie = estJourFerie(samediSuivant);
        if (samFerie) {
          commentaire = "Vendredi — samedi suivant férié, non ajouté";
        } else if (dateSet.has(samKey)) {
          commentaire = "Vendredi — entraîne le décompte du samedi";
        } else {
          commentaire = "Vendredi — plus de samedis disponibles, samedi non ajouté";
        }
      }
      details.push({
        date: jour,
        jourSemaine: nomJour,
        type: "semaine",
        decompte: true,
        commentaire,
      });
    }
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
 * Règle : on regarde le nombre de jours ouvrables (total CNETP) pris
 * en dehors de la période légale (1er mai → 31 octobre).
 * - Si >= 6 jours pris hors période → 2 jours bonus
 * - Si 3 à 5 jours pris hors période → 1 jour bonus
 * - Sinon → 0
 *
 * La période légale est le 1er mai au 31 octobre de l'année en cours.
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
    explication = `${joursPrisHorsPeriode} jour(s) pris hors période (1/05–31/10) → 2 jours de fractionnement`;
  } else if (joursPrisHorsPeriode >= 3) {
    bonus = 1;
    explication = `${joursPrisHorsPeriode} jour(s) pris hors période (1/05–31/10) → 1 jour de fractionnement`;
  } else {
    bonus = 0;
    explication = `${joursPrisHorsPeriode} jour(s) pris hors période (1/05–31/10) → pas de fractionnement (min. 3 requis)`;
  }

  return { joursPrisHorsPeriode, joursPrisEnPeriode, bonus, explication };
}
