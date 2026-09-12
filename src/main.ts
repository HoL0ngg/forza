import './style.css';
import { Game } from './core/game';
import { Hud } from './ui/hud';

const hud = new Hud();
document.querySelector('#reload')!.addEventListener('click', () => location.reload());
try {
  const game = new Game(hud);
  game.startLoop();
} catch (error) {
  console.error('Coastline Drive could not initialize:', error);
  hud.error();
}
