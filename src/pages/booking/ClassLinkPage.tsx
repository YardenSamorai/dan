import { Navigate, useParams } from 'react-router-dom';
import { isClass } from '../../domain/scheduling';
import { usePublicTenant } from './TenantContext';

/** Where "a spot opened" messages point: straight into booking that session. */
export default function ClassLinkPage() {
  const { sessionId = '' } = useParams();
  const tenant = usePublicTenant();
  const service = tenant.business.services.filter(isClass).find((s) => tenant.sessions(s.id).some((x) => x.id === sessionId));
  return <Navigate to={service ? `${tenant.base}/new?service=${service.id}&session=${encodeURIComponent(sessionId)}` : `${tenant.base}/new`} replace />;
}
