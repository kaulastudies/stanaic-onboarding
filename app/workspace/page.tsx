import type { Metadata } from 'next';
import Workspace from './workspace';
import './workspace.css';
export const metadata: Metadata = { title: 'STANAIC · Institutional workspace', description: 'Membership, learning, publishing and institutional operations.' };
export default function Page() { return <Workspace />; }
