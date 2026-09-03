import { AuctionRoom } from './components/AuctionRoom';
import { Layout } from './components/Layout';
import { useMidnight } from './hooks/useMidnight';

export default function App() {
  const session = useMidnight();
  return (
    <Layout session={session}>
      <AuctionRoom session={session} />
    </Layout>
  );
}
