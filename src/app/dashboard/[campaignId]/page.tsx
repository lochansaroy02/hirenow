import { DashboardClient } from "@/components/DashboardClient";

type DashboardPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { campaignId } = await params;
  return <DashboardClient campaignId={campaignId} />;
}
