const API_BASE_URL = "https://track-profit-loss.traone.workers.dev";

export function buildGoogleAuthUrl() {
  const url = new URL("/auth/google", API_BASE_URL);
  url.searchParams.set("redirect_to", `${window.location.origin}/auth/callback`);
  return url.toString();
}

export function parseCallbackUrl(url: string): {
  type: "success" | "error";
  payload?: any;
  message?: string;
} {
  const parsedUrl = new URL(url);
  const errorMessage = parsedUrl.searchParams.get("error_description");
  if (errorMessage) {
    return { type: "error", message: errorMessage };
  }

  const accessToken = parsedUrl.searchParams.get("access_token");
  const refreshToken = parsedUrl.searchParams.get("refresh_token");
  const tokenType = parsedUrl.searchParams.get("token_type");
  const expiresIn = Number(parsedUrl.searchParams.get("expires_in"));
  const userId = parsedUrl.searchParams.get("user_id");
  const userEmail = parsedUrl.searchParams.get("user_email");
  const userName = parsedUrl.searchParams.get("user_name");

  if (
    !accessToken ||
    !refreshToken ||
    !tokenType ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    !userId ||
    !userEmail ||
    !userName
  ) {
    return {
      type: "error",
      message: "Traone Profit did not receive a complete sign-in response.",
    };
  }

  return {
    type: "success",
    payload: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      expires_in: expiresIn,
      user: {
        id: userId,
        email: userEmail,
        name: userName,
        avatar_url: parsedUrl.searchParams.get("user_avatar_url"),
      },
    },
  };
}
