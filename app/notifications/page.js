import { NotificationList } from "@/components/Notifications";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <h1 className="display h-lg cobalt" style={{ marginBottom: 18 }}>
        Notifications
      </h1>
      <NotificationList />
    </>
  );
}
