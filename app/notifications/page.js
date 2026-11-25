import { NotificationList } from "@/components/Notifications";
import { FollowedTopics } from "@/components/FollowTopic";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <h1 className="display h-lg cobalt" style={{ marginBottom: 18 }}>
        Notifications
      </h1>
      <FollowedTopics />
      <NotificationList />
    </>
  );
}
