import { NotificationsPageClient } from "./notifications-client";

export const metadata = {
  title: "Notifications | TaskChain",
  description: "View your notification history",
};

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}
