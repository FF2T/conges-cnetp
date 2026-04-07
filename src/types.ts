import type { DecompteDetail } from "./calcul";

export interface DemandeConge {
  id: string;
  dateDebut: Date;
  dateFin: Date;
  joursSemaine: number;
  samedis: number;
  totalJours: number;
  details: DecompteDetail[];
  creeLe: Date;
}

export interface Compteurs {
  totalInitial: number;
  semaineInitial: number;
  samedisInitial: number;
  semainePris: number;
  samedisPris: number;
  fractionnement: number;
  semaineRestant: number;
  samedisRestant: number;
  totalRestant: number;
}
