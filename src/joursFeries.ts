/**
 * Calcul des jours fériés français pour une année donnée.
 * Inclut les fêtes fixes et mobiles (Pâques, Ascension, Pentecôte).
 */

function jourPaques(annee: number): Date {
  // Algorithme de Meeus/Jones/Butcher
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

function ajouterJours(date: Date, jours: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + jours);
  return d;
}

export function getJoursFeries(annee: number): Date[] {
  const paques = jourPaques(annee);

  return [
    new Date(annee, 0, 1),   // Jour de l'An
    ajouterJours(paques, 1), // Lundi de Pâques
    new Date(annee, 4, 1),   // Fête du Travail
    new Date(annee, 4, 8),   // Victoire 1945
    ajouterJours(paques, 39), // Ascension
    ajouterJours(paques, 50), // Lundi de Pentecôte
    new Date(annee, 6, 14),  // Fête nationale
    new Date(annee, 7, 15),  // Assomption
    new Date(annee, 10, 1),  // Toussaint
    new Date(annee, 10, 11), // Armistice
    new Date(annee, 11, 25), // Noël
  ];
}

export function estJourFerie(date: Date): boolean {
  const annee = date.getFullYear();
  const feries = getJoursFeries(annee);
  return feries.some(
    (f) =>
      f.getFullYear() === date.getFullYear() &&
      f.getMonth() === date.getMonth() &&
      f.getDate() === date.getDate()
  );
}
