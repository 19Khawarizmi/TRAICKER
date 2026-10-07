import AgencyTracker from "@/components/AgencyTracker";
import AuthGate from "@/components/AuthGate";

export default function Home() {
  return (
    <AuthGate>
      <AgencyTracker />
    </AuthGate>
  );
}
