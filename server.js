const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");
const path = require("path");

const app = express();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 } // 限制为 50MB
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json({ limit: '50mb' })); // 将限制调整为 50MB
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const API_KEY = "pat_7gQLrLf6piZEnj2Yd9VOpXELFXnPblzdFzmVyyIbso9t0c4U5wlCTh4ZoYTPgfcS";
const DATASET_ID = "7506922150122438683";
const KNOW1_ID="7512406295795351590";
const KNOW2_ID="7511562432147357715";

// 静态文件托管（如有前端 HTML）
app.use(express.static(path.join(__dirname, 'public')));

// 文件夹路径
const baseDir = path.join(__dirname, 'documents');
const reportDir = path.join(baseDir, 'reportTemplates');
const supplementDir = path.join(baseDir, 'supplementaryMaterials');

// 获取文件列表接口（区分类别）
app.get('/file-list', (req, res) => {
  const result = {
    reportTemplates: [],
    supplementaryMaterials: []
  };

  try {
    result.reportTemplates = fs.existsSync(reportDir) ? fs.readdirSync(reportDir) : [];
    result.supplementaryMaterials = fs.existsSync(supplementDir) ? fs.readdirSync(supplementDir) : [];
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '无法读取文件夹' });
  }
});

// 下载接口：支持分类目录下载
app.get('/download/:category/:filename', (req, res) => {
  const { category, filename } = req.params;

  const dirMap = {
    reportTemplates: reportDir,
    supplementaryMaterials: supplementDir
  };

  const folder = dirMap[category];
  if (!folder) {
    return res.status(400).send('无效的分类');
  }

  const filePath = path.join(folder, filename);
  res.download(filePath, filename, (err) => {
    if (err) res.status(404).send('文件未找到');
  });
});


//删除知识库旧文件
async function deleteExistingDocs() {
  try {
    const listRes = await axios.post(
      "https://api.coze.cn/open_api/knowledge/document/list",
      { dataset_id: DATASET_ID, page: 0, size: 10 },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "Agw-Js-Conv": "str"
        }
      }
    );

    const docs = listRes.data.document_infos || [];
    if (docs.length === 0) return;

    const ids = docs.map(d => d.document_id);
    console.log("🗑️ 删除文档：", ids);

    await axios.post(
      "https://api.coze.cn/open_api/knowledge/document/delete",
      { document_ids: ids },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "Agw-Js-Conv": "str"
        }
      }
    );
    console.log("✅ 删除完成");
  } catch (e) {
    console.error("❌ 删除失败", e.response?.data || e.message);
  }
}

//上传课程安排文件
app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;

  try {
    await deleteExistingDocs();

    const base64 = fs.readFileSync(file.path).toString("base64");
    const file_name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const requestBody = {
      dataset_id: DATASET_ID,
      document_bases: [
        {
          name: file_name,
          source_info: {
            document_source: 0,
            file_base64: base64,
            file_type: "pdf"
          }
        }
      ],
      chunk_strategy: {
        separator: "\n\n",
        max_tokens: 800,
        remove_extra_spaces: false,
        remove_urls_emails: false,
        chunk_type: 0
      }
    };

    const result = await axios.post(
      "https://api.coze.cn/open_api/knowledge/document/create",
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "Agw-Js-Conv": "str"
        }
      }
    );

    if (result.data.code === 0) {
      const stream = fs.createReadStream(file.path);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${file.originalname}`);
      stream.pipe(res);
    } else {
      res.status(500).json({ message: "上传失败：" + result.data.msg });
    }
  } catch (e) {
    res.status(500).json({ message: e.response?.data || e.message });
  } finally {
    setTimeout(() => fs.unlink(file.path, () => {}), 3000);
  }
});

//上传课程补充文件
app.post("/upload-experiment", upload.single("file"), async (req, res) => {
  const { user_id, experiment, extra_notes } = req.body;
  const { password } = req.body;
  if (password !== "12345") {
    return res.status(403).json({ message: "❌ 密码错误，禁止上传" });
  }
  
  const file = req.file;

  let targetDatasetId;

  if (experiment === "double_prism") {
    targetDatasetId = KNOW1_ID;
  } else if (experiment === "youngs_modulus") {
    targetDatasetId = KNOW2_ID;
  } else {
    return res.status(400).json({ message: "未知实验类型" });
  }

  try {
    const base64 = fs.readFileSync(file.path).toString("base64");
    const file_name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const requestBody = {
      dataset_id: targetDatasetId,
      document_bases: [
        {
          name: file_name,
          source_info: {
            document_source: 0,
            file_base64: base64,
            file_type: "pdf"
          }
        }
      ],
      chunk_strategy: {
        separator: "\n\n",
        max_tokens: 800,
        remove_extra_spaces: false,
        remove_urls_emails: false,
        chunk_type: 0
      }
    };

    const result = await axios.post(
      "https://api.coze.cn/open_api/knowledge/document/create",
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "Agw-Js-Conv": "str"
        }
      }
    );

    if (result.data.code === 0) {
      res.status(200).json({ message: "✅ 上传成功" });
    } else {
      res.status(500).json({ message: "❌ 上传失败：" + result.data.msg });
    }
  } catch (e) {
    res.status(500).json({ message: e.response?.data || e.message });
  } finally {
    setTimeout(() => fs.unlink(file.path, () => {}), 3000);
  }
});

//启动服务器
app.listen(3000, () => console.log("服务器已启动: http://localhost:3000"));
