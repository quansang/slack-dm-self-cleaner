# Slack DM Self Cleaner

Tiện ích Chrome mã nguồn mở, không chính thức, dùng để xem trước và xóa vĩnh viễn **chỉ các tin nhắn do tài khoản Slack đang đăng nhập gửi** trong cuộc trò chuyện trực tiếp 1:1 đang mở tại `app.slack.com`.

- Hỗ trợ DM với người khác và self-DM đã được xác minh.
- Từ chối channel, group DM và Enterprise Grid.
- Không cần Slack app, OAuth, backend, analytics, mã từ xa hay nhập thông tin đăng nhập.
- Chỉ gửi request tới Slack từ tab Slack đang mở. Giá trị phiên chỉ tồn tại trong bộ nhớ, không được tiện ích lưu hoặc ghi log.

Dự án này không liên kết, không được chứng thực và không được tài trợ bởi Slack Technologies, LLC.

## Cơ chế an toàn

Tiện ích không tin vào URL `D…` nếu chưa xác minh. Trước khi tạo bản xem trước và trước khi xóa, các nguồn sau phải khớp hoàn toàn:

1. URL trực tiếp `/client/T…/D…`;
2. mục workspace tương ứng trong cấu hình phiên cục bộ của trang Slack;
3. workspace và người dùng từ `auth.test`; và
4. `conversations.info` xác nhận đúng conversation là `is_im` và có participant hợp lệ.

Self-DM chỉ hợp lệ khi participant của IM đã xác minh chính là người dùng đang đăng nhập. Mỗi candidate chỉ giữ channel, timestamp, author và subtype đã duyệt, không giữ nội dung. URL và phiên cục bộ được kiểm tra trước từng lần xóa; identity, target và pin được kiểm tra lúc bắt đầu và định kỳ. Mọi trường hợp không chắc chắn đều dừng tác vụ.

## Cách dùng an toàn

1. Đăng nhập tại `https://app.slack.com`, mở đúng **DM với người khác** hoặc **DM với chính bạn**.
2. Bấm biểu tượng tiện ích.
3. Kiểm tra workspace, account, loại/tên target và DM ID hiển thị.
4. Giữ **All accessible history** để dùng phạm vi mặc định không cần nhập ngày. Tiện ích không gửi date bound và quét toàn bộ lịch sử Slack đang trả về.
5. Hoặc chọn **Custom date range**, nhập ngày địa phương **On or after** và **On or before**. Tiện ích vẫn duyệt thread root cũ để không bỏ sót reply nằm trong khoảng ngày.
6. Giữ **Keep pinned messages** bật, trừ khi bạn chủ động muốn đưa tin nhắn đã pin vào phạm vi xóa.
7. Chọn **Scan messages**. Có thể dừng scan dài; scan chưa hoàn tất sẽ không tạo preview.
8. Kiểm tra candidate/excluded count, thời điểm scan, thời hạn 15 phút, snapshot boundary, phạm vi và chính sách pin. Tin nhắn gửi sau lúc scan không nằm trong snapshot.
9. Đánh dấu xác nhận xóa vĩnh viễn rồi mới xóa. Nút Stop luôn có trong lúc xóa.
10. Chờ trạng thái **Complete**, **Stopped** hoặc **Failed after partial work**. Đóng/tắt panel, rời trang hoặc extension context mất hiệu lực đều hủy tác vụ; ẩn panel không bao giờ được xem là thành công.

Không bật đồng thời bản Store và bản unpacked trên cùng trang Slack. Hai bản cùng hoạt động sẽ hard-stop; hãy tắt một bản rồi reload Slack.

## Cài từ GitHub Release khi Store chưa được duyệt

Chrome Web Store chưa duyệt listing. ZIP trong GitHub Release là cách cài tạm trước phê duyệt tại nơi chính sách Chrome cho phép Developer mode.

1. Mở GitHub Release tương ứng, tải `dist.zip` và `SHA256SUMS`.
2. Xác minh checksum; dừng ngay nếu không khớp:
   - macOS/Linux: `shasum -a 256 dist.zip`
   - Windows PowerShell: `Get-FileHash .\dist.zip -Algorithm SHA256`
3. Giải nén `dist.zip` vào thư mục cố định. Kiểm tra `manifest.json` nằm ngay trong thư mục đó.
4. Mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked**, rồi chọn thư mục đã giải nén.
5. Ghim Slack DM Self Cleaner, mở hoặc reload `app.slack.com`, rồi bấm biểu tượng tiện ích.

Chrome do tổ chức quản lý có thể chặn Developer mode. Bản unpacked không tự cập nhật và thư mục đã giải nén phải được giữ nguyên vị trí.

### Cập nhật bản unpacked

1. Stop tác vụ đang chạy và chờ trạng thái kết thúc.
2. Tải và xác minh release mới.
3. Thay thư mục đã giải nén bằng nội dung mới.
4. Bấm **Reload** cho tiện ích tại `chrome://extensions`.
5. Reload mọi tab Slack đang mở.

### Gỡ bản unpacked

Stop tác vụ, chờ trạng thái kết thúc, gỡ tiện ích tại `chrome://extensions`, rồi reload Slack.

## Cài từ Chrome Web Store sau khi được duyệt

Hiện chưa có Store listing được duyệt; không tin listing có tên tương tự. Sau khi repository này công bố link Store đã xác minh:

1. Stop tác vụ, gỡ bản unpacked nếu có và reload Slack trước khi cài bản Store.
2. Chỉ mở link listing đã xác minh được công bố trong repository này, chọn **Add to Chrome** và xem lại quyền truy cập site.
3. Ghim tiện ích và reload Slack. Store tự cập nhật, nhưng tab Slack đang mở có thể cần reload sau cập nhật.
4. Khi gỡ cài đặt, Stop và chờ trạng thái kết thúc, gỡ bản Store, rồi reload Slack.

## Nội dung được và không được xóa

**Có thể xóa:** top-level message và thread reply có subtype được hỗ trợ, do chính tài khoản đã xác minh gửi, Slack hiện trả về trong DM và phạm vi đã chọn. Tin nhắn `file_share` chỉ được xóa như một message.

**Không bị xóa:** tin nhắn của người khác, Slack file object, edit history, lịch sử bị ẩn/không truy cập được, bản sao retention/Legal Hold/Discovery/compliance, saved-for-later state, channel, group DM hoặc nội dung Enterprise Grid.

`message_not_found` được ghi là **Already gone**, không tính là xóa thành công. Lỗi policy, response sai định dạng, hết retry rate/network, identity, target hoặc pin không chắc chắn đều dừng ở failed-partial.

## Quyền riêng tư và bảo mật

Xem [PRIVACY.md](./PRIVACY.md) và [SECURITY.md](./SECURITY.md). Không đưa giá trị phiên, cookie, workspace/user ID thật, nội dung DM hoặc dữ liệu browser profile vào issue hay screenshot.

Hỗ trợ: [GitHub Issues](https://github.com/quansang/slack-dm-self-cleaner/issues), chỉ dùng dữ liệu giả lập hoặc đã che.

## Build và xác minh

Cần Node.js 20.19 trở lên.

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
npm test
npm run typecheck
npm run package
npm run verify:release
npm run scan:public
```

`npm run package` tạo `release/dist.zip`, `SHA256SUMS` và `provenance.json` có thể tái lập. ZIP chứa trực tiếp nội dung của `dist/`, nên `manifest.json` nằm ở root. Cùng một ZIP do CI build được dùng cho GitHub Release và Store; publish job không cài dependency hoặc chạy build tool.

## Rủi ro

Tiện ích phụ thuộc vào cấu hình phiên trình duyệt và web API nội bộ không được Slack tài liệu hóa. Slack có thể thay đổi hoặc cấm cơ chế này. Tiện ích không vượt qua policy workspace, retention, lịch sử không truy cập được hoặc compliance control. Xóa là vĩnh viễn; kênh phân phối không thể tắt từ xa bản đã cài.

## Ghi công

Fork từ [`om-1021/bulk-delete-for-slack`](https://github.com/om-1021/bulk-delete-for-slack) tại commit đã audit [`e106bda7c945c02712bd83896cf6e2b1e78d18a3`](https://github.com/om-1021/bulk-delete-for-slack/commit/e106bda7c945c02712bd83896cf6e2b1e78d18a3). Lịch sử gốc và thông báo MIT được giữ lại.

## Giấy phép

[MIT](./LICENSE)
