import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsersAdmin } from "@/components/UsersAdmin";

// Checked on the server as well as in the proxy, so the page cannot be reached
// by a non-admin even if the client-side nav is bypassed.
export default async function UsersAdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/admin/users");
  }

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  return <UsersAdmin currentUserId={user.id} />;
}
