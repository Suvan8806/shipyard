import { NotFoundState } from '@/components/shipyard/states';

// notFound() inside the dashboard: the (dash) layout already renders the shell, so only the body here.
export default function DashNotFound() {
  return <NotFoundState title="Page not found">That page doesn&apos;t exist in Shipyard.</NotFoundState>;
}
