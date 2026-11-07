import type { Measure, RateUnit } from '../core/rate';

/**
 * The three supported kinds of work. Others (tutors, drivers, labour, spaces, care) are paused until their
 * modules exist; old workspaces with those ids fall back to Trades wording and keep all their data.
 */
export type TemplateId = 'trades' | 'equipment' | 'freelancer';

export interface Template {
  id: TemplateId;
  title: string;
  short: string;
  examples: string;
  icon: string; // MaterialCommunityIcons name
  resourceWord: string;
  customerWord: string;
  defaultUnit: RateUnit;
  suggestedRateRupees: number;
  suggestedResourceName: string;
  visitChargeRupees: number;
  /** Resource kind created at setup: 'machine' turns on hour-meter readings. */
  resourceKind: 'self' | 'machine';
  /** What this kind of work gets that the others do not, shown on the welcome card. */
  highlights: string[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'trades', short: 'Trades & home services', title: 'Trades & home services', examples: 'Electrician, plumber, carpenter, AC repair, painter',
    icon: 'tools', resourceWord: 'Service', customerWord: 'Customer', defaultUnit: 'hour', suggestedRateRupees: 300,
    suggestedResourceName: 'My work', visitChargeRupees: 100, resourceKind: 'self',
    highlights: ['Visit charge and minimum time', 'Materials and parts on every job', 'Sites for customers with many places'],
  },
  {
    id: 'equipment', short: 'Equipment & vehicle rental', title: 'Equipment & vehicle rental', examples: 'JCB, tractor, crane, generator, car, tempo',
    icon: 'excavator', resourceWord: 'Machine', customerWord: 'Customer', defaultUnit: 'hour', suggestedRateRupees: 1200,
    suggestedResourceName: 'My machine', visitChargeRupees: 0, resourceKind: 'machine',
    highlights: ['Machines by hour meter, vehicles by odometer km', 'Per day rentals, per acre or per trip without a timer', 'Minimum hours or km, overtime, night rate'],
  },
  {
    id: 'freelancer', short: 'Freelancers & consultants', title: 'Freelancers & consultants', examples: 'Developer, designer, CA, lawyer, consultant',
    icon: 'laptop', resourceWord: 'Service', customerWord: 'Client', defaultUnit: 'hour', suggestedRateRupees: 800,
    suggestedResourceName: 'My time', visitChargeRupees: 0, resourceKind: 'self',
    highlights: ['Projects under each client', 'GST tax invoices with due dates', 'Expenses passed on to the client'],
  },
];

/**
 * "How do you charge?" choices shown at setup, in plain words with an example.
 * Each one fixes the unit, how the work is measured and the kind of thing being charged for.
 */
export interface ChargeOption {
  id: string; title: string; example: string; icon: string;
  unit: RateUnit; measure: Measure; kind: 'self' | 'machine';
  resourceName: string; rate: number; visitCharge?: number;
}

export const CHARGE_OPTIONS: Record<string, ChargeOption[]> = {
  trades: [
    { id: 'job', title: 'A fixed price per job', example: 'Fan fitting ₹300, tap repair ₹250', icon: 'hammer-wrench', unit: 'job', measure: 'count', kind: 'self', resourceName: 'Repair job', rate: 300 },
    { id: 'hour', title: 'Per hour of work', example: 'Wiring ₹300 an hour + visit charge', icon: 'timer-outline', unit: 'hour', measure: 'timer', kind: 'self', resourceName: 'Labour', rate: 300, visitCharge: 100 },
    { id: 'day', title: 'Per day', example: 'Painting ₹900 a day', icon: 'calendar-today', unit: 'day', measure: 'count', kind: 'self', resourceName: 'Day work', rate: 900 },
  ],
  machine: [
    { id: 'hourmeter', title: "Per hour, from the machine's hours counter", example: 'JCB ₹1,200 an hour — note the hours shown on the machine', icon: 'gauge', unit: 'hour', measure: 'hourmeter', kind: 'machine', resourceName: 'JCB', rate: 1200 },
    { id: 'timer', title: 'Per hour, by timer', example: 'Crane ₹1,500 an hour — tap Start and Stop', icon: 'timer-outline', unit: 'hour', measure: 'timer', kind: 'machine', resourceName: 'Crane', rate: 1500 },
    { id: 'acre', title: 'Per acre', example: 'Tractor ploughing ₹1,000 an acre', icon: 'tractor', unit: 'acre', measure: 'count', kind: 'machine', resourceName: 'Tractor', rate: 1000 },
    { id: 'trip', title: 'Per trip', example: 'Water tanker ₹600 a trip', icon: 'truck-outline', unit: 'trip', measure: 'count', kind: 'machine', resourceName: 'Tanker', rate: 600 },
    { id: 'day', title: 'Per day', example: 'Generator ₹2,500 a day', icon: 'calendar-today', unit: 'day', measure: 'timer', kind: 'machine', resourceName: 'Generator', rate: 2500 },
  ],
  vehicle: [
    { id: 'gps', title: 'Per km, counted by GPS', example: 'Car ₹12 a km — the phone counts the km while driving', icon: 'map-marker-distance', unit: 'km', measure: 'gps', kind: 'self', resourceName: 'My car', rate: 12 },
    { id: 'odometer', title: 'Per km, from the dashboard', example: 'Tempo ₹18 a km — note the km on the dashboard at start and end', icon: 'counter', unit: 'km', measure: 'odometer', kind: 'self', resourceName: 'My tempo', rate: 18 },
    { id: 'day', title: 'Per day', example: 'Self-drive car ₹2,000 a day', icon: 'calendar-today', unit: 'day', measure: 'timer', kind: 'self', resourceName: 'Rental car', rate: 2000 },
    { id: 'trip', title: 'Per trip', example: 'Airport drop ₹900', icon: 'map-marker-path', unit: 'trip', measure: 'count', kind: 'self', resourceName: 'My car', rate: 900 },
  ],
  freelancer: [
    { id: 'hour', title: 'Per hour, by timer', example: 'Design work ₹800 an hour', icon: 'timer-outline', unit: 'hour', measure: 'timer', kind: 'self', resourceName: 'My time', rate: 800 },
    { id: 'job', title: 'A fixed price per project', example: 'Website ₹40,000, logo ₹5,000', icon: 'briefcase-outline', unit: 'job', measure: 'count', kind: 'self', resourceName: 'Project', rate: 5000 },
    { id: 'day', title: 'Per day', example: 'Consulting ₹6,000 a day', icon: 'calendar-today', unit: 'day', measure: 'count', kind: 'self', resourceName: 'Consulting day', rate: 6000 },
  ],
};

export const getTemplate = (id: string | null | undefined): Template =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/** "Family" -> "Families", "Student" -> "Students". */
export const plural = (w: string) => (/[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
