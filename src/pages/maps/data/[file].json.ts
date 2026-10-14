import { populationFrames, ethnicityFrames, compositions, geographicPaths } from '../../../lib/map/timeline';
export function getStaticPaths() {
  return [
    { params: { file: 'population' }, props: { data: populationFrames() } },
    { params: { file: 'ethnicity' }, props: { data: { frames: ethnicityFrames(), bars: compositions() } } },
    { params: { file: 'geography' }, props: { data: geographicPaths() } },
  ];
}
export const GET = ({ props }: { props: { data: unknown } }) => new Response(JSON.stringify(props.data), { headers: { 'Content-Type': 'application/json' } });
