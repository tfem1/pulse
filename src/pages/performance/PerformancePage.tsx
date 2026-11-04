import { Cpu, Gauge, HardDrive, MemoryStick, Network } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { RangeSelector, type RangeSec } from '@/components/charts/RangeSelector';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/i18n';
import { CpuPanel } from './CpuPanel';
import { DiskPanel } from './DiskPanel';
import { GpuPanel } from './GpuPanel';
import { MemoryPanel } from './MemoryPanel';
import { NetworkPanel } from './NetworkPanel';

const TABS = ['cpu', 'memory', 'disk', 'network', 'gpu'] as const;
type Tab = (typeof TABS)[number];

export function PerformancePage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'cpu';
  const [range, setRange] = useState<RangeSec>(60);

  return (
    <div>
      <PageHeader
        title={t('performance.title')}
        description={t('performance.description')}
        actions={<RangeSelector value={range} onChange={setRange} />}
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList aria-label={t('performance.families')}>
          <TabsTrigger value="cpu">
            <Cpu /> {t('metric.cpu')}
          </TabsTrigger>
          <TabsTrigger value="memory">
            <MemoryStick /> {t('metric.memory')}
          </TabsTrigger>
          <TabsTrigger value="disk">
            <HardDrive /> {t('metric.disk')}
          </TabsTrigger>
          <TabsTrigger value="network">
            <Network /> {t('metric.network')}
          </TabsTrigger>
          <TabsTrigger value="gpu">
            <Gauge /> {t('metric.gpu')}
          </TabsTrigger>
        </TabsList>
        {/* Only the active panel is mounted, so hidden charts cost nothing. */}
        <TabsContent value="cpu">{tab === 'cpu' && <CpuPanel range={range} />}</TabsContent>
        <TabsContent value="memory">{tab === 'memory' && <MemoryPanel range={range} />}</TabsContent>
        <TabsContent value="disk">{tab === 'disk' && <DiskPanel range={range} />}</TabsContent>
        <TabsContent value="network">{tab === 'network' && <NetworkPanel range={range} />}</TabsContent>
        <TabsContent value="gpu">{tab === 'gpu' && <GpuPanel range={range} />}</TabsContent>
      </Tabs>
    </div>
  );
}
