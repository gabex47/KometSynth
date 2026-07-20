import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <main className="route-state"><div><SearchX size={25} /><h1>Route not found.</h1><p>This address is not part of the SynthNet workspace.</p><Link href="/">RETURN HOME</Link></div></main>;
}
