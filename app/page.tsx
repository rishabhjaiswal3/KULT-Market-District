import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
import Market from "./market";

export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Market signedIn={Boolean(user)} displayName={user?.displayName || null} signInPath={chatGPTSignInPath("/")} signOutPath={chatGPTSignOutPath("/")} />;
}
