import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PROTECTED = [
  "/hoje",
  "/treino",
  "/progresso",
  "/plano",
  "/checkin",
  "/onboarding",
];

export const proxy = auth((req) => {
  const path = req.nextUrl.pathname;
  const needsAuth = PROTECTED.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (needsAuth && !req.auth) {
    const url = new URL("/", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/hoje/:path*",
    "/treino/:path*",
    "/progresso/:path*",
    "/plano/:path*",
    "/checkin/:path*",
    "/onboarding/:path*",
  ],
};
