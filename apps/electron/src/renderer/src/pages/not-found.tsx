import { Link } from "react-router";

export default function NotFoundPage(): React.JSX.Element {
  return (
    <div className="bg-background flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/app" className="text-primary underline underline-offset-4">
        Go to App
      </Link>
    </div>
  );
}
