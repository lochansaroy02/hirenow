import { Suspense } from "react";
import { GmailSettings } from "@/components/GmailSettings";

export default function SettingsPage() {
  return (
    <Suspense>
      <GmailSettings />
    </Suspense>
  );
}
