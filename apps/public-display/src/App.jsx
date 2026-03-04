import { Routes, Route } from 'react-router-dom';
import SelectScreen from './pages/SelectScreen';
import LiveScoreboard from './pages/LiveScoreboard';
import FieldView from './pages/FieldView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SelectScreen />} />
      <Route path="/live" element={<LiveScoreboard />} />
      <Route path="/field/:fieldId" element={<FieldView />} />
    </Routes>
  );
}
