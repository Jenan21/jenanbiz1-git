import { ProgramRouteContract } from "@/components/programs/program-route-contract";

export default function ProgramsLayout({ children }: { children: React.ReactNode }) {
  return <ProgramRouteContract>{children}</ProgramRouteContract>;
}