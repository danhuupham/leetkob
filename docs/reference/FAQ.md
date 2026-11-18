# LeeTKOB FAQ

Câu trả lời của product owner cho những chỗ class brief chưa nói tới. "Brief" là *LeeTKOB — the class project brief* đính kèm trên Classroom; nếu FAQ và brief mâu thuẫn thì theo brief. Cách hỏi và cách trích dẫn: xem [`README.md`](README.md).

**Trước khi hỏi:** tìm trong bảng *Tra nhanh* bên dưới, hoặc bấm `Ctrl+F` (`Cmd+F` trên Mac) và gõ một từ khoá, tiếng Việt hay tiếng Anh đều được (ví dụ `nộp lại`, `unsure`, `publish`). Mỗi mục có một dòng **Từ khoá** để dễ tìm. Không thấy câu của bạn thì hỏi dưới bài ghim trên group Facebook.

**Về mã FAQ:** mã được cấp theo thứ tự tạo và không bao giờ đổi, để link trích dẫn không bị gãy. Các mục được xếp theo chủ đề, nên mục mới (ví dụ FAQ-15) có thể nằm giữa các mục cũ.

## Tra nhanh

| Bạn muốn biết | Xem |
|---|---|
| Ai tạo lớp, lab; sinh viên vào lớp; ai thấy dữ liệu của ai | [FAQ-01](#faq-01) |
| Nộp nhiều lần, bài nào được tính; sinh viên thấy gì ngay khi nộp | [FAQ-02](#faq-02) |
| Nộp trễ, gia hạn, tính giờ theo đâu | [FAQ-03](#faq-03) |
| Bài WA, TLE, CE… được mấy điểm; TA cho điểm theo ý tưởng | [FAQ-04](#faq-04) |
| Giới hạn thời gian, bộ nhớ, output, lệnh biên dịch | [FAQ-05](#faq-05) |
| Sinh viên có thấy ràng buộc và mức trừ không | [FAQ-06](#faq-06) |
| TA sửa, thêm, xoá ràng buộc khi lab đang mở | [FAQ-07](#faq-07) |
| Sinh viên thấy kết quả soát lúc nào | [FAQ-08](#faq-08) |
| TA làm gì với verdict `unsure` | [FAQ-09](#faq-09) |
| Mẫu 10% bài `pass`; TA đổi verdict | [FAQ-10](#faq-10) |
| Công thức điểm; vi phạm nhiều chỗ trừ mấy lần | [FAQ-11](#faq-11) |
| Khi nào được Publish; sửa điểm sau Publish | [FAQ-12](#faq-12) |
| Khiếu nại: được gì, hạn bao lâu | [FAQ-13](#faq-13) |
| Khiếu nại bị bác có mở lại được không | [FAQ-14](#faq-14) |

## Thuật ngữ dùng trong FAQ

- **Lab:** một bài tập TA giao cho một lớp, có đề, bộ test, ràng buộc và hạn nộp.
- **Ba mốc của một lab:** **mở nhận bài** (sinh viên bắt đầu nộp được) → **hết hạn nộp** → **công bố điểm** (TA bấm Publish, sinh viên thấy điểm).
- **Kết quả chấm test:** verdict của judge (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`), có ngay sau khi nộp.
- **Kết quả soát ràng buộc:** verdict `pass` / `violation` / `unsure` cho từng ràng buộc, do luật cứng hoặc mô hình đưa ra, chờ TA duyệt.
- **Bài được tính:** bài nộp duy nhất của mỗi sinh viên dùng để chấm điểm lab đó (FAQ-02).
- **Hàng chờ duyệt:** danh sách verdict TA phải xem trước khi Publish.
- **Khoản trừ:** một ràng buộc TA đã xác nhận là vi phạm, kèm mức trừ của ràng buộc đó.

---

## Lớp và tài khoản

<a id="faq-01"></a>
### FAQ-01: Ai tạo lớp, ai tạo lab, sinh viên vào lớp thế nào?

*2026-10-25. Brief: mục 4, ý 1.*
**Từ khoá:** lớp, class, lab, admin, TA, mã mời, invite code, phân quyền, role, ownership.

**Trả lời.**
- **Admin** tạo lớp và gán TA vào lớp. Một lớp có nhiều TA được, một TA ở nhiều lớp được.
- **TA** tạo lab trong lớp mình phụ trách.
- **Sinh viên** vào lớp bằng mã mời hoặc do TA thêm vào; mỗi nhóm làm **ít nhất một** trong hai cách. Một sinh viên học nhiều lớp được.
- **Ai thấy gì:** TA chỉ thấy lab, bài nộp và hàng chờ của lớp mình. Sinh viên chỉ thấy lab của lớp mình và **bài nộp của chính mình**.

**Lý do.** Brief đã nêu "TAs belong to classes" và "each lab belongs to a class". Mục này ghi rõ ai được làm gì, để mọi nhóm viết luật phân quyền giống nhau và red-team ở PA#4 có cùng một chuẩn để thử.

---

## Nộp và chấm bài

<a id="faq-02"></a>
### FAQ-02: Sinh viên được nộp bao nhiêu lần, bài nào được tính?

*2026-10-25. Brief: mục 4, ý 2.*
**Từ khoá:** nộp lại, nộp nhiều lần, resubmit, bài cuối, last submission, realtime, kết quả chấm.

**Trả lời.**
- Trước hạn, sinh viên **nộp bao nhiêu lần cũng được**. Mỗi lần nộp được chấm ngay; sinh viên thấy verdict tổng và verdict từng test, nhưng **không thấy input, output của test**.
- **Bài được tính là bài nộp cuối cùng trước hạn, dù kết quả của nó là gì.**
  Ví dụ: nộp lúc 20:00 được `AC`, nộp lại lúc 21:00 bị `WA` → bài 21:00 được tính.
- Chỉ bài được tính mới được soát ràng buộc để vào hàng chờ của TA. **Trước hạn**, hàng chờ hiện bài nộp mới nhất của mỗi sinh viên (tạm tính); **khi hết hạn** thì chốt.

*Ghi chú cho các nhóm:* hệ thống được phép soát sớm từng bài `AC` để đỡ dồn việc sau hạn, nhưng hàng chờ chỉ hiện kết quả của bài được tính.

**Lý do.** Sinh viên luôn biết chắc bài nào sẽ được chấm. TA chỉ duyệt một bài cho mỗi sinh viên mỗi lab, nên chi phí gọi mô hình cho một lab tính trước được.

<a id="faq-03"></a>
### FAQ-03: Có nhận bài nộp sau hạn không?

*2026-10-25. Brief: không nói tới.*
**Từ khoá:** nộp trễ, late, deadline, hạn nộp, gia hạn, extension, giờ server.

**Trả lời.**
- Không. Hết hạn thì không nộp được nữa.
- Hạn được so với **thời điểm server nhận bài**, không phải lúc chấm xong. Bài nhận trước hạn nhưng đang chờ trong hàng đợi vẫn hợp lệ.
- Không có gia hạn riêng cho từng sinh viên trong phạm vi chung. Nhóm nào làm thêm chính sách nộp trễ hay gia hạn thì ghi rõ trong repo của nhóm.

**Lý do.** Sát hạn có thể có tới 80 bài nộp cùng lúc (brief, mục 4 ý 6); sinh viên không được thiệt vì hàng đợi chậm. Nộp trễ không liên quan tới tính năng soát ràng buộc nên để ngoài phạm vi chung.

<a id="faq-04"></a>
### FAQ-04: Bài không Accepted thì được bao nhiêu điểm?

*2026-10-25. Brief: mục 3.*
**Từ khoá:** WA, TLE, MLE, RE, CE, lỗi biên dịch, điểm 0, điểm tay, chấm theo ý tưởng, partial.

**Trả lời.**
- Bài **Accepted**: điểm gốc 10, trừ các khoản trừ (FAQ-11).
- Bài **không Accepted**: mặc định **0 điểm** và **không soát ràng buộc**.
- Hệ thống **có thể** cho TA **nhập điểm tay** từ 0 đến 10 cho bài không Accepted, kèm một dòng lý do và ghi nhật ký. Đây là tính năng tuỳ chọn; nhóm không làm thì bài không Accepted luôn là 0 điểm.
- Hệ thống không tự chấm điểm từng phần (ví dụ theo số test qua).

**Lý do.**
- Brief chỉ soát bài Accepted, nên bài không Accepted không có khoản trừ nào để tính.
- 0 điểm là quy tắc đơn giản nhất và nhiều lớp đang dùng. Nhưng có TA vẫn cho điểm khi sinh viên làm đúng hướng, ví dụ cài merge sort đúng ý tưởng nhưng sai một chỗ khi trộn hai nửa, hoặc chỉ thiếu một dấu `;` nên không biên dịch được. Nhập điểm tay giữ được cách chấm đó.
- Mức điểm cho "đúng hướng" khác nhau giữa các lớp, nên để TA quyết từng bài, có lý do và nhật ký, thay vì bắt mọi nhóm cài một công thức chung.

<a id="faq-05"></a>
### FAQ-05: Giới hạn mặc định khi chạy bài là bao nhiêu?

*2026-10-25. Brief: mục 5. Yêu cầu tối thiểu của sandbox do thầy quy định; mục này chỉ đặt giá trị mặc định.*
**Từ khoá:** time limit, memory limit, giới hạn, g++, C++17, output limit, kích thước code, sandbox.

**Trả lời.** Đây là giá trị **mặc định** cho mỗi lab. Các yêu cầu bắt buộc ở brief mục 5 (không mạng, không chạy bằng root, không mount thư mục host, không truy cập Docker socket, không có secret) vẫn áp dụng đầy đủ. TA chỉnh được một số giới hạn trong khoảng cho phép:

| Giới hạn | Mặc định | TA chỉnh được | Vượt thì |
|---|---|---|---|
| Lệnh biên dịch | `g++ -std=c++17 -O2` | Không | — |
| Thời gian biên dịch | 10 giây, nếu sandbox cho đặt riêng | Không | `CE` |
| Kích thước code nộp | 64 KB | Không | Bị từ chối khi nộp, không tính là một lần nộp |
| CPU time mỗi test | 1 giây | 1–5 giây | `TLE` |
| Wall time mỗi test | 3 lần CPU time | Tự theo CPU time | `TLE` |
| Bộ nhớ | 256 MB | 64–512 MB | `MLE`, hoặc `RE` nếu sandbox không phân biệt được (ví dụ Judge0) |
| Số tiến trình, tính cả luồng | 16 | Không | Lệnh tạo thêm tiến trình bị từ chối; kết quả tuỳ chương trình xử lý (thường `RE` hoặc `WA`) |
| Output mỗi test | 1 MB | Không | `RE` |

**Lý do.** Cùng lệnh biên dịch với bộ eval của thầy. Giá trị chung giúp các nhóm so sánh được load test và có cùng chuẩn khi red-team ở PA#4.

*Ghi chú cho nhóm dùng Judge0:* Judge0 không có verdict `MLE`, và mặc định chỉ cho bộ nhớ tối đa khoảng 256 MB; muốn TA đặt tới 512 MB thì tăng `MAX_MEMORY_LIMIT` trong cấu hình Judge0.

---

## Ràng buộc

<a id="faq-06"></a>
### FAQ-06: Sinh viên có thấy danh sách ràng buộc và mức trừ không?

*2026-10-25. Brief: mục 3.*
**Từ khoá:** ràng buộc, constraint, mức trừ, deduction, đề bài, thông báo soát, mô hình, model.

**Trả lời.**
- Có. Từ lúc mở nhận bài, đề hiện đủ các ràng buộc, mỗi ràng buộc kèm mức trừ (trên thang 10).
- Trang nộp bài ghi rõ:
  - code sẽ được soát bằng luật cứng và mô hình;
  - mô hình chỉ nhận đề, ràng buộc và code đã bỏ comment, tên, MSSV;
  - mô hình không quyết điểm; TA duyệt trước khi công bố.

**Lý do.** Sinh viên không thể bị trừ vì một quy định họ không được biết. Brief yêu cầu "students are told about the review when they submit".

<a id="faq-07"></a>
### FAQ-07: TA có được sửa ràng buộc sau khi lab đã bắt đầu nhận bài nộp không?

*2026-10-25. Brief: không nói tới.*
**Từ khoá:** sửa ràng buộc, thêm ràng buộc, xoá ràng buộc, đổi mức trừ, edit constraint, soát lại.

**Trả lời.**

| Thời điểm | TA được làm gì với ràng buộc |
|---|---|
| **Trước khi mở nhận bài** | Thêm, xoá, sửa tự do. |
| **Từ lúc mở nhận bài đến trước khi công bố điểm** | **Không được thêm** ràng buộc mới, **không được tăng** mức trừ. Chỉ được: sửa câu chữ cho rõ hơn mà **không đổi ý nghĩa**, giảm mức trừ, hoặc xoá hẳn một ràng buộc. Mỗi lần sửa, mọi đề xuất cũ của ràng buộc đó bị huỷ và hệ thống soát lại. Đề hiện ngày sửa gần nhất. |
| **Sau khi công bố điểm** | Không sửa ràng buộc nữa. Muốn đổi điểm thì đi qua khiếu nại hoặc chỉnh điểm từng bài (FAQ-12). |

Sửa câu chữ mà **đổi ý nghĩa** (ví dụ từ "không dùng `std::sort`" thành "không dùng bất kỳ hàm nào trong `<algorithm>`") được tính là thêm ràng buộc mới, nên không được phép. Hệ thống không tự kiểm được câu chữ có đổi nghĩa hay không: đây là quy tắc cho TA. Hệ thống chỉ chặn việc thêm ràng buộc và tăng mức trừ, đồng thời lưu lịch sử mọi bản sửa để sinh viên đối chiếu khi khiếu nại.

**Lý do.**
- Sinh viên làm bài theo ràng buộc họ đọc được lúc nộp. Thêm luật hoặc tăng mức trừ sau đó là trừ điểm vì một quy định họ không được biết.
- Giảm mức trừ hay xoá ràng buộc chỉ có lợi cho sinh viên.
- Soát lại sau mỗi lần sửa để hàng chờ luôn khớp với ràng buộc hiện tại.

---

## Soát ràng buộc và duyệt

<a id="faq-08"></a>
### FAQ-08: Sinh viên có thấy kết quả soát ràng buộc trước khi công bố điểm không?

*2026-10-25. Brief: mục 3; mục 8 (câu hỏi mẫu).*
**Từ khoá:** bằng chứng, evidence, verdict, xem trước, trước công bố, nhận xét, feedback.

**Trả lời.**
- **Trước khi công bố:** không. Sinh viên chỉ thấy kết quả chấm test (FAQ-02). Kết quả của cả luật cứng lẫn mô hình đều ẩn.
- **Sau khi công bố:** sinh viên thấy **các khoản trừ** của bài mình. Mỗi khoản gồm: ràng buộc, mức trừ, các dòng code làm bằng chứng, lý do.
- Sinh viên **không bao giờ** thấy: đề xuất TA đã bác, verdict `unsure`, bài mình có nằm trong mẫu 10% hay không.

**Lý do.** Trước khi TA duyệt, đề xuất chưa phải quyết định. Cho xem sớm sẽ sinh khiếu nại về những thứ có thể bị bác, và giúp sinh viên nộp thử nhiều lần để lách bộ soát. Sau công bố, bằng chứng chính là nhận xét cho sinh viên.

<a id="faq-09"></a>
### FAQ-09: TA thấy gì với một verdict `unsure`?

*2026-10-25. Brief: mục 3; mục 8 (câu hỏi mẫu).*
**Từ khoá:** unsure, không chắc, hàng chờ, review queue, timeout, schema, hạn mức chi phí.

**Trả lời.**
- TA thấy: ràng buộc, toàn bộ code, và **nguyên nhân** dẫn tới `unsure`:
  - mô hình tự trả `unsure`;
  - đầu ra của mô hình sai schema;
  - dòng bằng chứng không khớp với code;
  - hết thời gian chờ;
  - lab đã vượt hạn mức chi phí.

  Có thêm lý do và các dòng mô hình nghi ngờ, nếu mô hình có trả.
- TA phải chọn `pass` hoặc `violation`. Không có lựa chọn mặc định; `unsure` **không bao giờ tự thành khoản trừ**.
- Chọn `violation` thì TA phải chỉ ít nhất một dòng code làm bằng chứng.
- Lab còn `unsure` chưa xử lý thì chưa Publish được (FAQ-12).

**Lý do.** Biết nguyên nhân giúp TA quyết nhanh hơn và giúp nhóm biết phải sửa guardrail nào. Bắt chỉ dòng code giữ đúng nguyên tắc: không có bằng chứng thì không trừ.

<a id="faq-10"></a>
### FAQ-10: Mẫu 10% bài `pass` chọn thế nào, và TA có đổi được verdict ngoài hàng chờ không?

*2026-10-25. Brief: mục 3.*
**Từ khoá:** mẫu 10%, sample, pass, đổi verdict, override, nhật ký, audit.

**Trả lời.**
- Hàng chờ gồm: mọi `violation`, mọi `unsure`, và **10% số verdict `pass` của lab, chọn ngẫu nhiên, làm tròn lên** (lab có ít nhất một `pass` thì có ít nhất một mẫu). Một verdict là một cặp (bài được tính, ràng buộc).
- Ngoài hàng chờ, TA vẫn mở được mọi bài của lab và đổi bất kỳ verdict nào trước khi công bố. Đổi sang `violation` thì phải chỉ dòng bằng chứng (như FAQ-09).
- Mỗi lần đổi ghi nhật ký: ai, lúc nào, verdict cũ, verdict mới.

**Lý do.** Hàng chờ để TA làm nhanh, không để giới hạn quyền của TA. 10% là mức tối thiểu để bắt các ca mô hình bỏ sót.

---

## Điểm và công bố

<a id="faq-11"></a>
### FAQ-11: Điểm cuối tính thế nào?

*2026-10-25. Brief: mục 3.*
**Từ khoá:** công thức điểm, tính điểm, mức trừ, trừ mấy lần, điểm âm, score.

**Trả lời.**
- Điểm = 10 − tổng mức trừ của các khoản trừ. **Thấp nhất là 0.**
- **Một ràng buộc chỉ bị trừ một lần** trong một bài, dù vi phạm ở nhiều chỗ. Các chỗ khác được liệt kê thêm làm bằng chứng.
- Mức trừ luôn lấy từ ràng buộc. Mô hình không đề xuất mức trừ. Muốn cho một bài mức khác thì TA chỉnh điểm tay, kèm lý do (FAQ-12).

Ví dụ: lab có C1 (trừ 3) và C2 (trừ 4). Bài gọi `std::sort` ở 2 chỗ và không tự cài merge sort → 10 − 3 − 4 = **3 điểm**.

**Lý do.** Mức trừ gắn với từng ràng buộc, không gắn với từng dòng code. Trừ một lần giữ điểm dễ hiểu và đúng mức TA đã cân nhắc khi ra đề.

<a id="faq-12"></a>
### FAQ-12: Khi nào được công bố điểm, và sau khi công bố còn sửa điểm được không?

*2026-10-25. Brief: mục 3; mục 4, ý 3.*
**Từ khoá:** publish, công bố, idempotent, huỷ công bố, sửa điểm, chỉnh điểm, nhật ký.

**Trả lời.**
- Publish **cả lab một lần**, chỉ được khi:
  1. đã hết hạn nộp, **và**
  2. hàng chờ không còn mục nào chưa có quyết định của TA.
- Bấm Publish lần nữa không thay đổi gì (an toàn khi lặp lại). Không có "huỷ công bố" và không công bố riêng từng sinh viên.
- Sau khi công bố, TA vẫn sửa được điểm **từng bài**, qua khiếu nại hoặc chỉnh tay, luôn kèm lý do. Sinh viên thấy ngay điểm mới và lý do; nhật ký giữ điểm cũ.

**Lý do.** Brief coi Publish là bước khó đảo ngược. Sửa từng bài có lý do đủ cho mọi trường hợp; huỷ công bố cả lab thì gây rối cho những sinh viên đã thấy điểm.

---

## Khiếu nại

<a id="faq-13"></a>
### FAQ-13: Khiếu nại được gì và hạn bao lâu?

*2026-10-25. Brief: mục 4, ý 4.*
**Từ khoá:** khiếu nại, appeal, phúc khảo, hạn khiếu nại, trạng thái khiếu nại.

**Trả lời.**
- Sinh viên khiếu nại **từng khoản trừ** của bài mình, **sau khi công bố**, trong **7 ngày** kể từ lúc công bố. Một bài có nhiều khoản trừ thì khiếu nại riêng từng khoản.
- Khiếu nại phải có ít nhất một câu giải thích vì sao mình không vi phạm.
- Trạng thái: **đang chờ** → **chấp nhận** (khoản trừ bị gỡ, điểm cập nhật) hoặc **bác**. Cả hai trường hợp TA đều phải ghi lý do.
- Không khiếu nại qua hệ thống đối với kết quả chấm test hay điểm TA nhập tay (FAQ-04). Những việc đó sinh viên trao đổi trực tiếp với TA.

**Lý do.** Brief định nghĩa khiếu nại là khiếu nại một khoản trừ. Có hạn thì TA chốt được điểm lab.

<a id="faq-14"></a>
### FAQ-14: Khiếu nại đã bị bác có mở lại được không?

*2026-10-25. Brief: mục 8 (câu hỏi mẫu).*
**Từ khoá:** mở lại khiếu nại, reopen, khiếu nại lần hai, bị bác, phúc khảo.

**Trả lời.**
- Sinh viên **không mở lại được**: mỗi khoản trừ chỉ khiếu nại một lần, và TA trả lời chấp nhận hoặc bác **kèm lý do**.
- TA vẫn tự sửa điểm sau đó nếu nhận ra mình sai (FAQ-12).
- Muốn phúc khảo tiếp thì làm ngoài hệ thống, với giảng viên.

**Lý do.** Tránh vòng khiếu nại không kết thúc, nhưng vẫn giữ đường sửa sai cho TA và đường phúc khảo của trường.