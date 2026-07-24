import { redirect } from 'next/navigation';

/**
 * The Mortgage Simulator moved under Labs (`/labs/mortgage-simulator`).
 * Redirect the old URL so bookmarks / cached links keep working.
 */
export default function MortgageSimulatorMoved() {
  redirect('/labs/mortgage-simulator');
}
