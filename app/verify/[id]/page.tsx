import type { Metadata } from 'next';
import Verify from './verify';
import '../../workspace/workspace.css';
export const metadata: Metadata = { title: 'STANAIC · Credential verification', description: 'Check a completion credential against the issuer registry.' };
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Verify credentialId={id}/>}
