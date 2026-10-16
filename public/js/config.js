// =====================================================================
// public/js/config.js
// TOÀN BỘ nội dung có thể sửa của website nằm ở file này.
//
// QUY ƯỚC:
// - Chỗ có chú thích "THAY:" là dữ liệu mẫu, hãy thay bằng thông tin thật.
// - File này chạy cả ở trình duyệt lẫn Node (server dùng nó làm danh sách hợp lệ
//   cho biểu mẫu), nên KHÔNG dùng window, document hay API trình duyệt ở đây.
// - Mỗi mục trong services, form.budgets, form.timelines, form.contactMethods
//   bắt buộc có "id" duy nhất (chữ thường, không dấu, dùng dấu gạch ngang).
// - Sửa xong file này: khởi động lại server (npm start), rồi tải lại trang.
// =====================================================================

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export const CONFIG = deepFreeze({
  // ---------- Thông tin chung ----------
  site: {
    name: 'Phoenix Web', // THAY: tên thương hiệu
    domain: 'ten-mien-cua-ban.vn', // THAY: tên miền thật
    lang: 'vi'
  },

  // ---------- Điều hướng (4 điểm mốc) ----------
  nav: [
    { page: 1, label: 'Chào mừng' },
    { page: 2, label: 'Dịch vụ' },
    { page: 3, label: 'Đặt dịch vụ' },
    { page: 4, label: 'Về chúng tôi' }
  ],

  // ---------- Màn hình loading ----------
  loader: {
    messages: [
      'Đang nhóm lửa...',
      'Đang dựng bầu trời đêm...',
      'Đang đánh thức phượng hoàng...',
      'Sắp xong rồi...'
    ],
    errorText: 'Không tải được trang. Vui lòng kiểm tra kết nối mạng rồi thử lại.',
    retryLabel: 'Tải lại trang',
    skipLabel: 'Bỏ qua'
  },

  // ---------- Trang 1: chào mừng ----------
  hero: {
    title: 'Chào mừng đến với Phoenix Web', // THAY: có thể đổi lời chào
    tagline: 'Chúng tôi thiết kế website bùng cháy trong trí nhớ khách hàng: đẹp, nhanh, an toàn và sinh ra khách mới cho doanh nghiệp của bạn.',
    ctaLabel: 'Khám phá dịch vụ',
    ctaSecondaryLabel: 'Gửi yêu cầu ngay',
    hint: 'Cuộn hoặc vuốt để tiếp tục'
  },

  // ---------- Trang 2: dịch vụ ----------
  servicesPage: {
    title: 'Dịch vụ của chúng tôi',
    lead: 'Từ một trang giới thiệu gọn nhẹ đến hệ thống bán hàng hoàn chỉnh. Chọn nhóm, xoay vòng thẻ và mở từng dịch vụ để xem chi tiết.',
    registerLabel: 'Đăng ký dịch vụ này',
    detailLabel: 'Xem chi tiết',
    closeLabel: 'Đóng',
    mergeLabel: 'Gộp thẻ',
    splitLabel: 'Bung thẻ',
    prevLabel: 'Dịch vụ trước',
    nextLabel: 'Dịch vụ tiếp theo',
    itemsHeading: 'Hạng mục bao gồm',
    durationLabel: 'Thời gian dự kiến',
    priceLabel: 'Mức giá',
    dragHint: 'Kéo hoặc vuốt để xoay, bấm vào thẻ để xem chi tiết.'
  },

  groups: [
    { id: 'all', label: 'Tất cả' },
    { id: 'thiet-ke', label: 'Thiết kế' },
    { id: 'phat-trien', label: 'Phát triển' },
    { id: 'van-hanh', label: 'Vận hành' }
  ],

  // THAY: giá, thời gian và hạng mục theo bảng giá thật của bạn.
  services: [
    {
      id: 'website-doanh-nghiep',
      group: 'phat-trien',
      name: 'Website giới thiệu doanh nghiệp',
      glyph: 'W',
      summary: 'Bộ mặt chính thức của doanh nghiệp trên mạng: chuyên nghiệp, rõ ràng, dễ liên hệ.',
      detail: 'Website nhiều trang giới thiệu về công ty, sản phẩm, dịch vụ, đội ngũ và tin tức. Thiết kế riêng theo nhận diện thương hiệu, hiển thị tốt trên điện thoại và có sẵn biểu mẫu liên hệ.',
      items: [
        'Thiết kế giao diện riêng, không dùng mẫu có sẵn',
        '5 đến 10 trang nội dung chuẩn SEO cơ bản',
        'Trang quản trị để tự cập nhật tin tức',
        'Biểu mẫu liên hệ và bản đồ',
        'Hướng dẫn sử dụng sau bàn giao'
      ],
      duration: '3 đến 5 tuần',
      price: 'Từ 12.000.000đ'
    },
    {
      id: 'website-ban-hang',
      group: 'phat-trien',
      name: 'Website bán hàng / thương mại điện tử',
      glyph: 'S',
      summary: 'Cửa hàng trực tuyến đầy đủ giỏ hàng, thanh toán và quản lý đơn.',
      detail: 'Hệ thống bán hàng hoàn chỉnh: danh mục sản phẩm, tìm kiếm, giỏ hàng, thanh toán trực tuyến, quản lý đơn hàng và tồn kho, tích hợp đơn vị vận chuyển phổ biến tại Việt Nam.',
      items: [
        'Danh mục, thuộc tính và biến thể sản phẩm',
        'Giỏ hàng, mã giảm giá, thanh toán trực tuyến',
        'Quản lý đơn hàng, khách hàng, tồn kho',
        'Tích hợp vận chuyển và hóa đơn',
        'Báo cáo doanh thu cơ bản'
      ],
      duration: '6 đến 10 tuần',
      price: 'Từ 30.000.000đ'
    },
    {
      id: 'landing-page',
      group: 'thiet-ke',
      name: 'Landing page',
      glyph: 'L',
      summary: 'Một trang duy nhất tập trung vào một mục tiêu: để khách để lại thông tin.',
      detail: 'Trang đích cho chiến dịch quảng cáo hoặc ra mắt sản phẩm. Bố cục dẫn dắt người xem từ vấn đề đến giải pháp và kêu gọi hành động, tải nhanh để không mất khách từ quảng cáo.',
      items: [
        'Viết cấu trúc nội dung theo mục tiêu chiến dịch',
        'Thiết kế và dựng trang tối ưu tốc độ',
        'Biểu mẫu thu khách hàng tiềm năng',
        'Gắn công cụ đo lường chuyển đổi',
        'Một lần chỉnh sửa sau khi chạy thử'
      ],
      duration: '5 đến 10 ngày',
      price: 'Từ 4.000.000đ'
    },
    {
      id: 'web-app',
      group: 'phat-trien',
      name: 'Web app theo yêu cầu',
      glyph: 'A',
      summary: 'Phần mềm chạy trên trình duyệt, đo ni đóng giày cho quy trình của bạn.',
      detail: 'Xây dựng ứng dụng web nội bộ hoặc hướng khách hàng: quản lý đặt lịch, quản lý khách hàng, cổng đại lý, bảng điều khiển số liệu. Phân tích nghiệp vụ trước, làm theo từng giai đoạn nhỏ để bạn dùng thử sớm.',
      items: [
        'Phân tích yêu cầu và tài liệu chức năng',
        'Thiết kế cơ sở dữ liệu và API',
        'Phân quyền người dùng, nhật ký thao tác',
        'Kiểm thử và triển khai theo giai đoạn',
        'Tài liệu hướng dẫn và đào tạo'
      ],
      duration: 'Từ 8 tuần',
      price: 'Liên hệ báo giá'
    },
    {
      id: 'thiet-ke-ui-ux',
      group: 'thiet-ke',
      name: 'Thiết kế UI/UX',
      glyph: 'U',
      summary: 'Thiết kế trải nghiệm và giao diện trước khi viết dòng mã đầu tiên.',
      detail: 'Nghiên cứu người dùng, vẽ luồng thao tác, dựng khung giao diện rồi thiết kế hoàn chỉnh. Bạn duyệt bản thiết kế tương tác trước khi bắt đầu lập trình để tránh sửa tốn kém về sau.',
      items: [
        'Phân tích khách hàng mục tiêu và đối thủ',
        'Sơ đồ trang và luồng thao tác',
        'Khung giao diện (wireframe) và bản thiết kế chi tiết',
        'Bộ quy chuẩn màu sắc, chữ, thành phần',
        'Bản mẫu tương tác để duyệt'
      ],
      duration: '2 đến 4 tuần',
      price: 'Từ 8.000.000đ'
    },
    {
      id: 'website-3d',
      group: 'thiet-ke',
      name: 'Website 3D / tương tác',
      glyph: '3',
      summary: 'Trải nghiệm điện ảnh trên trình duyệt, khiến khách dừng lại và nhớ bạn.',
      detail: 'Website dùng WebGL và hoạt ảnh để kể câu chuyện thương hiệu, trưng bày sản phẩm theo không gian ba chiều. Tối ưu để chạy mượt trên cả điện thoại tầm trung và có bản dự phòng cho máy yếu.',
      items: [
        'Ý tưởng và kịch bản trải nghiệm',
        'Dựng cảnh 3D, hạt, ánh sáng, chuyển cảnh',
        'Tương tác chuột, cảm ứng, bàn phím',
        'Bản dự phòng cho thiết bị không hỗ trợ',
        'Tối ưu hiệu năng trên nhiều thiết bị'
      ],
      duration: '6 đến 12 tuần',
      price: 'Liên hệ báo giá'
    },
    {
      id: 'toi-uu-toc-do',
      group: 'van-hanh',
      name: 'Tối ưu tốc độ',
      glyph: 'T',
      summary: 'Website chậm làm mất khách. Chúng tôi đo, tìm điểm nghẽn và làm nhanh lại.',
      detail: 'Kiểm tra toàn diện tốc độ tải và độ ổn định hiển thị, xử lý ảnh, mã, bộ nhớ đệm và máy chủ. Bạn nhận báo cáo trước và sau tối ưu bằng số đo cụ thể.',
      items: [
        'Đo đạc Core Web Vitals trước và sau',
        'Nén, đổi định dạng và tải lười hình ảnh',
        'Giảm và tách mã JavaScript, CSS',
        'Cấu hình bộ nhớ đệm và nén dữ liệu',
        'Báo cáo kết quả và khuyến nghị tiếp theo'
      ],
      duration: '1 đến 2 tuần',
      price: 'Từ 3.000.000đ'
    },
    {
      id: 'seo-co-ban',
      group: 'van-hanh',
      name: 'SEO cơ bản',
      glyph: 'E',
      summary: 'Nền móng để Google hiểu website của bạn và khách tìm thấy bạn.',
      detail: 'Thiết lập các yếu tố kỹ thuật và nội dung cần có để công cụ tìm kiếm lập chỉ mục đúng: cấu trúc tiêu đề, thẻ mô tả, sơ đồ trang, dữ liệu có cấu trúc và nghiên cứu từ khóa cho những trang quan trọng.',
      items: [
        'Nghiên cứu từ khóa cho các trang chính',
        'Tối ưu tiêu đề, mô tả, cấu trúc nội dung',
        'Sơ đồ trang, robots và dữ liệu có cấu trúc',
        'Kết nối Google Search Console và Analytics',
        'Báo cáo hiện trạng và lộ trình'
      ],
      duration: '2 đến 3 tuần',
      price: 'Từ 5.000.000đ'
    },
    {
      id: 'hosting-ten-mien-ssl',
      group: 'van-hanh',
      name: 'Hosting, tên miền và SSL',
      glyph: 'H',
      summary: 'Chúng tôi lo phần kỹ thuật để website luôn online, luôn có khóa bảo mật.',
      detail: 'Tư vấn và đăng ký tên miền, cấu hình máy chủ lưu trữ phù hợp quy mô, cài chứng chỉ SSL, thiết lập email theo tên miền và sao lưu định kỳ. Bạn đứng tên sở hữu tên miền.',
      items: [
        'Đăng ký tên miền đứng tên bạn',
        'Máy chủ lưu trữ cấu hình theo lưu lượng',
        'Chứng chỉ SSL tự động gia hạn',
        'Email theo tên miền',
        'Sao lưu định kỳ và giám sát hoạt động'
      ],
      duration: '1 đến 3 ngày',
      price: 'Từ 2.500.000đ / năm'
    },
    {
      id: 'bao-tri-ho-tro',
      group: 'van-hanh',
      name: 'Bảo trì và hỗ trợ',
      glyph: 'B',
      summary: 'Có người trực website của bạn: cập nhật, vá lỗi, sao lưu, hỗ trợ nhanh.',
      detail: 'Gói bảo trì hằng tháng gồm cập nhật bảo mật, sao lưu, theo dõi hoạt động và xử lý sự cố. Mỗi gói có số giờ chỉnh sửa nội dung và thời gian phản hồi cam kết.',
      items: [
        'Cập nhật và vá lỗ hổng bảo mật',
        'Sao lưu hằng ngày, thử khôi phục định kỳ',
        'Giám sát hoạt động và báo động sự cố',
        'Số giờ chỉnh sửa nội dung mỗi tháng',
        'Hỗ trợ qua điện thoại và email'
      ],
      duration: 'Theo tháng',
      price: 'Từ 1.500.000đ / tháng'
    },
    {
      id: 'chatbot-ai',
      group: 'phat-trien',
      name: 'Tích hợp chatbot AI',
      glyph: 'C',
      summary: 'Trợ lý trả lời khách 24/7 bằng chính dữ liệu của doanh nghiệp bạn.',
      detail: 'Gắn chatbot vào website để tư vấn sản phẩm, trả lời câu hỏi thường gặp và thu thập thông tin khách hàng tiềm năng. Chatbot chỉ trả lời trong phạm vi nội dung bạn cung cấp và chuyển cho nhân viên khi cần.',
      items: [
        'Nạp tài liệu và câu hỏi thường gặp của bạn',
        'Giới hạn phạm vi trả lời, chặn nội dung lạc đề',
        'Chuyển cuộc trò chuyện cho nhân viên',
        'Lưu thông tin khách để tiếp tục chăm sóc',
        'Báo cáo câu hỏi khách hay hỏi'
      ],
      duration: '2 đến 4 tuần',
      price: 'Từ 10.000.000đ'
    },
    {
      id: 'nang-cap-website',
      group: 'thiet-ke',
      name: 'Nâng cấp / thiết kế lại website cũ',
      glyph: 'N',
      summary: 'Giữ lại thứ đang hiệu quả, làm mới phần đã cũ, không mất thứ hạng tìm kiếm.',
      detail: 'Đánh giá website hiện tại, giữ lại nội dung và địa chỉ trang có giá trị, thiết kế lại giao diện, chuyển sang nền tảng nhanh và an toàn hơn. Chuyển hướng đúng để không mất thứ hạng đã có trên Google.',
      items: [
        'Đánh giá hiện trạng và đề xuất giữ, bỏ, làm mới',
        'Thiết kế lại giao diện thích ứng điện thoại',
        'Di chuyển nội dung và dữ liệu',
        'Chuyển hướng địa chỉ cũ sang mới',
        'Chạy song song kiểm tra trước khi chuyển hẳn'
      ],
      duration: '3 đến 6 tuần',
      price: 'Từ 9.000.000đ'
    }
  ],

  // ---------- Trang 3: biểu mẫu đặt dịch vụ ----------
  form: {
    title: 'Đặt dịch vụ',
    lead: 'Cho chúng tôi biết bạn cần gì. Chúng tôi phản hồi trong vòng một ngày làm việc.',
    labels: {
      name: 'Họ và tên',
      email: 'Email',
      phone: 'Số điện thoại',
      services: 'Dịch vụ quan tâm',
      budget: 'Ngân sách dự kiến',
      timeline: 'Thời gian mong muốn',
      message: 'Mô tả yêu cầu',
      contactMethod: 'Hình thức liên hệ ưa thích',
      consent: 'Đồng ý xử lý dữ liệu cá nhân'
    },
    placeholders: {
      name: 'Nguyễn Văn A',
      email: 'ban@congty.vn',
      phone: '0901 234 567',
      message: 'Ví dụ: Cửa hàng của tôi bán đồ gốm, cần website có giỏ hàng và thanh toán, mong ra mắt trước Tết.',
      select: 'Chọn một mục'
    },
    hints: {
      phone: 'Số di động hoặc số bàn Việt Nam, có thể nhập +84.',
      services: 'Có thể chọn nhiều dịch vụ.',
      message: 'Càng cụ thể, chúng tôi báo giá càng chính xác.'
    },
    maxMessageLength: 2000,
    submitLabel: 'Gửi yêu cầu',
    sendingLabel: 'Đang gửi...',
    turnstileLabel: 'Xác minh bạn không phải robot',
    consentText: 'Tôi đồng ý để Phoenix Web thu thập và xử lý họ tên, email, số điện thoại và nội dung yêu cầu của tôi nhằm mục đích liên hệ tư vấn và báo giá. Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân, tôi có quyền yêu cầu truy cập, chỉnh sửa, xóa dữ liệu hoặc rút lại sự đồng ý bất cứ lúc nào bằng cách liên hệ qua email của đơn vị. Dữ liệu không được bán hay chia sẻ cho bên thứ ba vì mục đích quảng cáo.',
    // Thông báo lỗi hiển thị cho khách (khớp mã lỗi server).
    errors: {
      required: 'Vui lòng điền trường này.',
      email: 'Email không hợp lệ.',
      phone: 'Số điện thoại Việt Nam không hợp lệ.',
      consent: 'Bạn cần đồng ý để chúng tôi xử lý dữ liệu và gửi yêu cầu.',
      robot: 'Vui lòng hoàn tất bước xác minh bạn không phải robot.',
      network: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
      rateLimited: 'Bạn đã gửi quá số lần cho phép. Vui lòng thử lại sau hoặc gọi trực tiếp cho chúng tôi.',
      server: 'Có lỗi phía máy chủ. Vui lòng thử lại sau ít phút.'
    },
    success: {
      title: 'Cảm ơn bạn, yêu cầu đã được gửi',
      text: 'Chúng tôi sẽ liên hệ với bạn trong vòng một ngày làm việc.',
      refLabel: 'Mã yêu cầu của bạn',
      againLabel: 'Gửi yêu cầu khác',
      homeLabel: 'Về trang chủ'
    },
    budgets: [
      { id: 'duoi-5tr', label: 'Dưới 5 triệu đồng' },
      { id: '5-15tr', label: '5 đến 15 triệu đồng' },
      { id: '15-30tr', label: '15 đến 30 triệu đồng' },
      { id: '30-100tr', label: '30 đến 100 triệu đồng' },
      { id: 'tren-100tr', label: 'Trên 100 triệu đồng' },
      { id: 'chua-ro', label: 'Chưa rõ, cần tư vấn' }
    ],
    timelines: [
      { id: 'cang-som', label: 'Càng sớm càng tốt' },
      { id: '1-thang', label: 'Trong 1 tháng' },
      { id: '1-3-thang', label: 'Trong 1 đến 3 tháng' },
      { id: 'tren-3-thang', label: 'Trên 3 tháng' },
      { id: 'linh-hoat', label: 'Linh hoạt' }
    ],
    contactMethods: [
      { id: 'dien-thoai', label: 'Gọi điện thoại' },
      { id: 'email', label: 'Email' },
      { id: 'zalo', label: 'Zalo' },
      { id: 'hop-truc-tuyen', label: 'Họp trực tuyến' }
    ]
  },

  // ---------- Trang 4: giới thiệu đơn vị chủ website ----------
  about: {
    name: 'Phoenix Web',
    tagline: 'Xưởng thiết kế website cho doanh nghiệp Việt muốn được nhớ lâu.',
    openingHint: 'Cuộn xuống để khám phá',

    story: {
      title: 'Câu chuyện thương hiệu',
      paragraphs: [
        // THAY: viết lại theo câu chuyện thật của đơn vị.
        'Phoenix Web bắt đầu từ một nhóm nhỏ làm website cho cửa hàng và xưởng sản xuất quen biết. Nhiều khách hàng đã có website, nhưng nó chậm, khó dùng trên điện thoại và không mang về một đơn hàng nào.',
        'Chúng tôi chọn hình ảnh phượng hoàng vì tinh thần làm lại: tái sinh một website cũ, hoặc đốt cháy mọi ý tưởng nhàm chán để dựng nên thứ khiến người xem dừng lại.',
        'Ngày nay, chúng tôi đồng hành cùng doanh nghiệp từ ý tưởng, thiết kế, lập trình đến vận hành, và vẫn giữ cách làm ban đầu: nói rõ, làm đúng hẹn, bàn giao đầy đủ.'
      ]
    },

    pillars: {
      title: 'Sứ mệnh, tầm nhìn, giá trị cốt lõi',
      items: [
        { id: 'su-menh', title: 'Sứ mệnh', text: 'Giúp mọi doanh nghiệp Việt có website đẹp, nhanh, an toàn và thật sự mang lại khách hàng.' },
        { id: 'tam-nhin', title: 'Tầm nhìn', text: 'Trở thành xưởng thiết kế website được doanh nghiệp vừa và nhỏ tin chọn nhờ chất lượng và sự minh bạch.' },
        { id: 'gia-tri', title: 'Giá trị cốt lõi', text: 'Trung thực trong báo giá. Tỉ mỉ trong chi tiết. Có trách nhiệm đến cùng sau bàn giao.' }
      ]
    },

    team: {
      title: 'Đội ngũ',
      flipHint: 'Bấm vào thẻ để xem tiểu sử.',
      // THAY: tên, chức danh và tiểu sử thật.
      members: [
        { id: 'tv1', name: 'Trần Minh Anh', role: 'Nhà sáng lập, Giám đốc sáng tạo', bio: 'Hơn 10 năm thiết kế giao diện và hoạt ảnh. Phụ trách định hướng thẩm mỹ cho mọi dự án.' },
        { id: 'tv2', name: 'Lê Quốc Bảo', role: 'Trưởng nhóm kỹ thuật', bio: 'Chuyên WebGL, hiệu năng và bảo mật ứng dụng web. Mỗi dòng mã đều qua tay anh trước khi ra mắt.' },
        { id: 'tv3', name: 'Phạm Thu Hà', role: 'Thiết kế UI/UX', bio: 'Bắt đầu từ người dùng thật. Chị vẽ luồng thao tác trước, tô màu sau.' },
        { id: 'tv4', name: 'Nguyễn Đức Long', role: 'Quản lý dự án', bio: 'Người giữ lời hẹn với khách hàng: lịch rõ ràng, báo cáo đều đặn, không phát sinh bất ngờ.' }
      ]
    },

    timeline: {
      title: 'Hành trình',
      // THAY: các cột mốc thật.
      milestones: [
        { id: 'm1', year: '2017', title: 'Những website đầu tiên', text: 'Nhóm nhận dự án đầu tay cho cửa hàng và xưởng sản xuất ở địa phương.' },
        { id: 'm2', year: '2019', title: 'Thành lập Phoenix Web', text: 'Chính thức hoạt động với quy trình làm việc và bộ tiêu chuẩn chất lượng riêng.' },
        { id: 'm3', year: '2021', title: 'Bước vào thương mại điện tử', text: 'Triển khai các cửa hàng trực tuyến đầu tiên tích hợp thanh toán và vận chuyển.' },
        { id: 'm4', year: '2023', title: 'Website 3D tương tác', text: 'Đưa WebGL vào sản phẩm, ra mắt dòng website trải nghiệm điện ảnh.' },
        { id: 'm5', year: '2025', title: 'Chatbot AI cho doanh nghiệp', text: 'Tích hợp trợ lý trả lời khách bằng dữ liệu riêng của từng đơn vị.' }
      ]
    },

    stats: {
      title: 'Con số nổi bật',
      // THAY: số liệu thật. "height" là chiều cao cột (đơn vị rem) cho hiệu ứng cột mọc lên.
      items: [
        { id: 's1', value: 120, suffix: '+', label: 'Website đã bàn giao', height: 7 },
        { id: 's2', value: 85, suffix: '+', label: 'Doanh nghiệp đồng hành', height: 5.5 },
        { id: 's3', value: 8, suffix: ' năm', label: 'Kinh nghiệm thực chiến', height: 3.5 },
        { id: 's4', value: 98, suffix: '%', label: 'Khách hàng hài lòng', height: 6.5 }
      ]
    },

    process: {
      title: 'Quy trình làm việc',
      steps: [
        { id: 'p1', title: 'Lắng nghe và tư vấn', text: 'Tìm hiểu mục tiêu, khách hàng và ngân sách để đề xuất phương án phù hợp, không bán thừa.' },
        { id: 'p2', title: 'Báo giá và ký hợp đồng', text: 'Báo giá chi tiết theo hạng mục, tiến độ rõ ràng, ghi trong hợp đồng.' },
        { id: 'p3', title: 'Thiết kế', text: 'Dựng khung, thiết kế giao diện và bản mẫu tương tác để bạn duyệt trước khi lập trình.' },
        { id: 'p4', title: 'Lập trình và kiểm thử', text: 'Xây dựng theo từng giai đoạn nhỏ, kiểm thử trên nhiều thiết bị và trình duyệt.' },
        { id: 'p5', title: 'Bàn giao và đào tạo', text: 'Đưa website lên tên miền của bạn, hướng dẫn sử dụng và bàn giao toàn bộ tài khoản.' },
        { id: 'p6', title: 'Đồng hành sau bàn giao', text: 'Bảo hành, bảo trì và cải tiến dựa trên số liệu thực tế.' }
      ]
    },

    tech: {
      title: 'Công nghệ chúng tôi dùng',
      lead: 'Kéo quả cầu để xoay.',
      // THAY: công nghệ thực tế của đơn vị.
      items: [
        'HTML', 'CSS', 'JavaScript', 'Node.js', 'Express', 'Three.js',
        'WebGL', 'GSAP', 'SQLite', 'PostgreSQL', 'Figma', 'Cloudflare'
      ]
    },

    projects: {
      title: 'Dự án tiêu biểu',
      openLabel: 'Xem dự án',
      // THAY: dự án thật. colorA/colorB là hai màu của khung tranh minh họa.
      items: [
        { id: 'd1', title: 'Gốm Bát Tràng Online', tag: 'Thương mại điện tử', colorA: '#ff5a1f', colorB: '#3b1260', summary: 'Cửa hàng trực tuyến cho xưởng gốm truyền thống.', detail: 'Xây dựng cửa hàng có giỏ hàng, thanh toán và vận chuyển toàn quốc. Doanh thu kênh trực tuyến tăng gấp ba trong sáu tháng đầu.' },
        { id: 'd2', title: 'Nhà Bếp Sài Gòn', tag: 'Website giới thiệu', colorA: '#ffb627', colorB: '#2a1148', summary: 'Website giới thiệu chuỗi nhà hàng và đặt bàn.', detail: 'Thiết kế giao diện ẩm thực giàu hình ảnh, tích hợp đặt bàn trực tuyến và quản lý thực đơn theo chi nhánh.' },
        { id: 'd3', title: 'Hệ thống đặt lịch Spa Lotus', tag: 'Web app', colorA: '#ff8a00', colorB: '#1a0b2e', summary: 'Ứng dụng đặt lịch và quản lý khách hàng.', detail: 'Khách tự chọn dịch vụ và khung giờ, nhân viên nhận lịch theo thời gian thực, nhắc lịch tự động giảm hẹn bỏ.' },
        { id: 'd4', title: 'Triển lãm Ánh Sáng 3D', tag: 'Website 3D', colorA: '#ff3d00', colorB: '#4a1a78', summary: 'Triển lãm ảo bằng WebGL cho sự kiện nghệ thuật.', detail: 'Không gian ba chiều cho phép khách tham quan tác phẩm từ xa, chạy mượt trên điện thoại nhờ tối ưu tài nguyên.' }
      ]
    },

    testimonials: {
      title: 'Khách hàng nói gì',
      prevLabel: 'Lời chứng thực trước',
      nextLabel: 'Lời chứng thực tiếp theo',
      // THAY: lời chứng thực thật, đã được khách đồng ý đăng.
      items: [
        { id: 'k1', quote: 'Website mới tải nhanh gấp mấy lần cái cũ, và khách gọi đặt hàng nhiều hơn rõ rệt. Đội ngũ làm đúng hẹn, báo cáo đều đặn.', who: 'Chị Hoa, chủ xưởng gốm' },
        { id: 'k2', quote: 'Phần 3D khiến khách khen ngay từ lần đầu mở trang. Điều tôi thích hơn là mọi thứ vẫn chạy ổn trên điện thoại cũ.', who: 'Anh Tuấn, giám đốc một công ty sự kiện' },
        { id: 'k3', quote: 'Họ tư vấn bỏ bớt những tính năng chưa cần thiết. Nhờ vậy tôi tiết kiệm được ngân sách mà website vẫn đủ dùng.', who: 'Chị Lan, chủ chuỗi spa' }
      ]
    },

    faq: {
      title: 'Câu hỏi thường gặp',
      items: [
        { id: 'q1', q: 'Làm một website mất bao lâu?', a: 'Landing page từ 5 đến 10 ngày, website giới thiệu từ 3 đến 5 tuần, cửa hàng trực tuyến từ 6 đến 10 tuần. Thời gian cụ thể được ghi trong hợp đồng.' },
        { id: 'q2', q: 'Tôi có sở hữu website sau khi bàn giao không?', a: 'Có. Tên miền, mã nguồn và các tài khoản liên quan được bàn giao và đứng tên bạn.' },
        { id: 'q3', q: 'Website có hiển thị tốt trên điện thoại không?', a: 'Có. Mọi website được thiết kế thích ứng từ điện thoại nhỏ đến màn hình lớn và kiểm thử trên nhiều thiết bị trước khi bàn giao.' },
        { id: 'q4', q: 'Tôi có tự cập nhật nội dung được không?', a: 'Có. Chúng tôi làm trang quản trị đơn giản và hướng dẫn bạn sử dụng. Nếu không muốn tự làm, gói bảo trì có sẵn giờ chỉnh sửa mỗi tháng.' },
        { id: 'q5', q: 'Thanh toán chia thành mấy đợt?', a: 'Thường chia ba đợt: đặt cọc khi ký hợp đồng, thanh toán khi duyệt thiết kế, và phần còn lại khi bàn giao. Có thể điều chỉnh theo từng dự án.' },
        { id: 'q6', q: 'Thông tin tôi gửi qua biểu mẫu có an toàn không?', a: 'Biểu mẫu có xác minh chống robot, mã hóa khi truyền tải và chỉ dùng để liên hệ tư vấn. Chúng tôi không bán hay chia sẻ dữ liệu của bạn cho bên thứ ba.' }
      ]
    },

    promises: {
      title: 'Cam kết và bảo hành',
      items: [
        // THAY: điều khoản cam kết và thời hạn bảo hành thật.
        { id: 'c1', title: 'Đúng tiến độ', text: 'Lịch làm việc ghi trong hợp đồng. Trễ hẹn do phía chúng tôi, chúng tôi chịu trách nhiệm theo thỏa thuận.' },
        { id: 'c2', title: 'Bảo hành 12 tháng', text: 'Sửa miễn phí mọi lỗi kỹ thuật phát sinh từ phía chúng tôi trong 12 tháng kể từ ngày bàn giao.' },
        { id: 'c3', title: 'Báo giá minh bạch', text: 'Giá theo hạng mục, không phát sinh nếu phạm vi công việc không thay đổi.' },
        { id: 'c4', title: 'Bàn giao đầy đủ', text: 'Mã nguồn, tài khoản và tài liệu hướng dẫn được giao trọn gói khi nghiệm thu.' }
      ]
    },

    contact: {
      title: 'Liên hệ',
      ctaLabel: 'Gửi yêu cầu cho chúng tôi',
      // THAY: toàn bộ thông tin liên hệ thật.
      rows: [
        { id: 'address', label: 'Địa chỉ', value: '123 Đường Ví Dụ, Quận 1, TP. Hồ Chí Minh', href: '' },
        { id: 'phone', label: 'Điện thoại', value: '0900 000 000', href: 'tel:+84900000000' },
        { id: 'email', label: 'Email', value: 'lienhe@ten-mien-cua-ban.vn', href: 'mailto:lienhe@ten-mien-cua-ban.vn' },
        { id: 'hours', label: 'Giờ làm việc', value: 'Thứ Hai đến thứ Sáu, 8:30 đến 17:30', href: '' }
      ],
      social: [
        { id: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/' },
        { id: 'zalo', label: 'Zalo', href: 'https://zalo.me/' },
        { id: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/' },
        { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/' }
      ]
    },

    footer: {
      copyright: 'Phoenix Web. Bảo lưu mọi quyền.', // JS tự thêm năm hiện tại phía trước
      privacy: 'Chúng tôi chỉ thu thập thông tin bạn chủ động gửi qua biểu mẫu (họ tên, email, số điện thoại, nội dung yêu cầu) để liên hệ tư vấn và báo giá, theo Nghị định 13/2023/NĐ-CP. Dữ liệu không được bán hay chia sẻ cho bên thứ ba vì mục đích quảng cáo. Bạn có thể yêu cầu xem, sửa hoặc xóa dữ liệu bất cứ lúc nào qua email liên hệ.',
      links: [
        { label: 'Dịch vụ', href: '#/2' },
        { label: 'Đặt dịch vụ', href: '#/3' },
        { label: 'Về chúng tôi', href: '#/4' }
      ]
    }
  }
});
