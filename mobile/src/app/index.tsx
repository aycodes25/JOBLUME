import { Redirect } from 'expo-router';

/** The app root opens the queue; the auth gate sends signed-out users to /login first. */
export default function Index() {
  return <Redirect href="/queue" />;
}
