import AppRouteGuards from './router/AppRouteGuards';
import { useAppController } from './hooks/useAppController';

const App = () => {
  const guardProps = useAppController();
  return <AppRouteGuards {...guardProps} />;
};

export default App;
