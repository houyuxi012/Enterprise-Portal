import AppRouteGuards from './router/AppRouteGuards';
import { useAppController } from './app/hooks/useAppController';

const App = () => {
  const guardProps = useAppController();
  return <AppRouteGuards {...guardProps} />;
};

export default App;
