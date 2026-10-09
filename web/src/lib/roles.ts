export const ROLES = ["underwriter", "portfolio_manager", "cedant", "county"] as const;

export type UserRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  underwriter: "Underwriter",
  portfolio_manager: "Portfolio Manager",
  cedant: "Cedant",
  county: "Disaster Manager",
};

export const ROLE_HOME: Record<UserRole, string> = {
  underwriter: "/underwriter",
  portfolio_manager: "/portfolio",
  cedant: "/cedant",
  county: "/county",
};

export const DEMO_ACCOUNTS: { email: string; role: UserRole }[] = [
  { email: "underwriter@demo.com", role: "underwriter" },
  { email: "portfolio@demo.com", role: "portfolio_manager" },
  { email: "cedant@demo.com", role: "cedant" },
  { email: "county@demo.com", role: "county" },
];

export function roleForEmail(email: string): UserRole | null {
  return DEMO_ACCOUNTS.find((account) => account.email === email.trim().toLowerCase())?.role ?? null;
}

export function pageAllowed(pathname: string, role: UserRole): boolean {
  if (pathname === "/" || pathname === "/underwriter" || pathname.startsWith("/underwriter/")) return role === "underwriter";
  if (pathname === "/portfolio" || pathname.startsWith("/portfolio/")) return role === "underwriter" || role === "portfolio_manager";
  if (pathname === "/methodology" || pathname.startsWith("/methodology/")) return role === "underwriter";
  if (pathname === "/cedant" || pathname.startsWith("/cedant/")) return role === "cedant";
  if (pathname === "/county" || pathname.startsWith("/county/")) return role === "county";
  return false;
}