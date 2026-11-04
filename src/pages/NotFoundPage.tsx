import { Link } from 'react-router';
import { Unavailable } from '@/components/Unavailable';
import { useT } from '@/i18n';

export function NotFoundPage() {
  const t = useT();
  return (
    <Unavailable
      title={t('notFound.title')}
      description={t('notFound.description')}
      action={
        <Link to="/dashboard" className="mt-2 text-sm underline underline-offset-4">
          {t('notFound.back')}
        </Link>
      }
    />
  );
}
