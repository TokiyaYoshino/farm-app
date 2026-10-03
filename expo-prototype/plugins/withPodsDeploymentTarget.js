// Pods の各ターゲットの iOS 対応下限を、アプリと同じ値以上にそろえる設定プラグイン。
//
// 2026-10-03: 新しい Xcode（iOS 26 SDK）で、Pods の一部ターゲットが古い下限のまま
// （react-native-maps の Privacy バンドル 11.0 / AsyncStorage のリソース 13.4 / RNSVG の Filters 12.4）
// 「15.0 未満は対応範囲外」でビルドが止まった（docs/app-store-submission.md 進捗記録）。
// ios/ は .gitignore 対象で EAS がビルドのたびに作り直すため、Podfile を手で直しても効かない。
// prebuild のたびに Podfile の post_install へ同じ処理を差し込む。
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Expo SDK 54 の既定（Podfile の `platform :ios, ... || '15.1'`）に合わせる
const MIN_TARGET = "15.1";
const MARKER = "# withPodsDeploymentTarget";

// Podfile に入る部分は ASCII だけにする（CocoaPods は Podfile の非ASCIIで落ちることがある）
const SNIPPET = `
    ${MARKER}: raise pod targets below iOS ${MIN_TARGET}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        current = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MIN_TARGET}')
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
        end
      end
    end
`;

module.exports = function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let src = fs.readFileSync(podfile, "utf8");
      if (src.includes(MARKER)) return cfg; // 2回目の prebuild で二重に入れない
      // react_native_post_install(...) の呼び出しの直後に入れる（RN 側の設定を上書きできる位置）
      const re = /(react_native_post_install\([\s\S]*?\n\s*\)\n)/;
      if (!re.test(src)) {
        throw new Error("withPodsDeploymentTarget: Podfile に react_native_post_install が見つからない");
      }
      src = src.replace(re, `$1${SNIPPET}`);
      fs.writeFileSync(podfile, src);
      return cfg;
    },
  ]);
};
