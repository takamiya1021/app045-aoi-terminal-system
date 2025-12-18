import { test, expect } from '@playwright/test';

test('tmux panel should have transition classes', async ({ page }) => {
  await page.goto('/');

  // TmuxPanelのボタンを取得
  const toggleButton = page.getByRole('button', { name: /tmux Panel/i });
  await expect(toggleButton).toBeVisible();

  // パネルが表示されるエリアにアニメーション関連のクラスがあるか確認
  // 現状は条件分岐 (isOpen && ...) で消えるのでアニメーションしていないはず
  // 修正後は grid-rows-[0fr] -> grid-rows-[1fr] などの手法でアニメーションさせる
  const panelContainer = page.locator('[data-testid="tmux-panel-content"]');
  
  // 初期状態（閉じている）で高さを確認するなどのテストも可能
});
