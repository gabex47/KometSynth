import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <main className="route-state"><div role="status"><LoaderCircle className="spin" size={25} /><h1>Opening SynthNet.</h1><p>Validating your secure session and preparing the workspace.</p></div></main>;
}
